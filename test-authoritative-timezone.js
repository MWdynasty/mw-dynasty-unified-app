'use strict';
const assert=require('node:assert/strict');
const {isoDay,resolveFromCalendar}=require('./server/lib/mw-authoritative-state');

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
console.log('PASS: authoritative MW day respects athlete local timezone.');
