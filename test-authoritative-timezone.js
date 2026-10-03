'use strict';
const assert=require('node:assert/strict');
const {isoDay,resolveFromCalendar}=require('./server/lib/mw-authoritative-state');
const {calendarPosition,localCalendarDate}=require('./server/lib/mw-season-calendar');
const {positionForPlan}=require('./server/lib/mw-season-intelligence');

const lateFridayUtc=new Date('2026-10-03T02:20:00.000Z');
assert.equal(isoDay(lateFridayUtc,'America/Chicago'),5,'9:20 PM in Huntsville/Chicago time must remain Friday / Day 5');
assert.equal(isoDay(lateFridayUtc,'UTC'),6,'same instant is Saturday in UTC');
const state=resolveFromCalendar(
  {current_week:1,current_day:5,current_phase:1},
  {week:1,phase:1,sourceWeek:1,status:'active'},
  {now:lateFridayUtc,timeZone:'America/Chicago'}
);
assert.equal(state.day,5,'authoritative MW day follows athlete local timezone');
assert.equal(state.week,1);
const mondayEveningUtcTuesday=new Date('2026-10-06T00:30:00.000Z');
const chicagoLocalDate=localCalendarDate(mondayEveningUtcTuesday,'America/Chicago');
assert.equal(chicagoLocalDate.toISOString().slice(0,10),'2026-10-05','local calendar date must remain Monday in Central time');
assert.equal(
  calendarPosition({mode:'custom',customStart:'2026-09-29',now:chicagoLocalDate}).week,
  1,
  'custom calendar must not advance to week 2 until the athlete local date crosses the boundary'
);
assert.equal(
  positionForPlan({
    season_start_date:'2026-09-29',
    primary_peak_date:'2026-12-31',
    season_length_weeks:14,
    phase_plan:{foundation:{start:1,end:4},pre_competition:{start:5,end:7},competition:{start:8,end:11},peak:{start:12,end:14}},
    source_week_map:{'1':{sourceWeek:1},'2':{sourceWeek:2}}
  },chicagoLocalDate).week,
  1,
  'season-plan week must use the athlete local calendar date'
);
console.log('PASS: authoritative MW day and week respect athlete local timezone.');
