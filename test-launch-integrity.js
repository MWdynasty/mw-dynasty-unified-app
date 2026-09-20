const fs=require('fs');
const path=require('path');
const root=__dirname;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let failures=[];
const ok=(cond,msg)=>{if(!cond)failures.push(msg)};
const includes=(p,s,msg)=>ok(read(p).includes(s),msg||`${p} missing ${s}`);
const excludes=(p,s,msg)=>ok(!read(p).includes(s),msg||`${p} unexpectedly contains ${s}`);

const pkg=JSON.parse(read('package.json'));
ok(pkg.version==='3.0.16','package.json version must be 3.0.16');
includes('manifest.webmanifest','App 3.0.16','manifest description must match 3.0.16');
includes('assets/mw-native.js',"MW_APP_VERSION='3.0.16'",'web native bridge version mismatch');
includes('athlete/index.html','MW Dynasty 3.0.16 · iOS Build 13','athlete visible app version mismatch');
includes('ios_v3_0_16_patch/Config/Release.xcconfig','MARKETING_VERSION = 3.0.16','iOS marketing version mismatch');
includes('ios_v3_0_16_patch/Config/Release.xcconfig','CURRENT_PROJECT_VERSION = 13','iOS build number mismatch');
includes('ios_v3_0_16_patch/MWDynasty/WebViewController.swift','MWDynasty-iOS/3.0.16','iOS user agent version mismatch');
includes('ios_v3_0_16_patch/MWDynasty/WebViewController.swift','com.mwdynasty.app.athlete.monthly','Athlete App Store product ID missing');
includes('ios_v3_0_16_patch/MWDynasty/WebViewController.swift','com.mwdynasty.app.coach.core.monthly','Coach Core App Store product ID missing');
includes('ios_v3_0_16_patch/MWDynasty/WebViewController.swift','com.mwdynasty.app.coach.intelligence.monthly','Coach Intelligence App Store product ID missing');
includes('ios_v3_0_16_patch/MWDynasty/WebViewController.swift','com.mwdynasty.app.coach.sprintperformance.monthly','Sprint Performance App Store product ID missing');
includes('codemagic.yaml','submit_to_testflight: true','Codemagic signed build must submit to TestFlight');
includes('codemagic.yaml','bundle_identifier: com.mwdynasty.app','Codemagic bundle identifier mismatch');
includes('account/index.html',"document.documentElement.classList.contains('mw-native-app')",'Native billing mode detection missing');
includes('account/index.html','window.webkit?.messageHandlers?.mwPurchase','Native StoreKit purchase bridge missing from Account Billing');
includes('account/index.html','restorePurchasesBtn','Restore Purchases control missing');
includes('account/index.html','/terms.html','Terms of Use link missing from native subscription flow');
includes('account/index.html','/privacy.html','Privacy Policy link missing from native subscription flow');
includes('ios_v3_0_16_patch/MWDynasty/WebViewController.swift','let planCode = (body["planCode"] as? String) ?? "auto"','Automatic App Store restore discovery missing');
includes('assets/mw-diagnostics.js',"window.MWDiag={event:event,snapshot:snapshot,flush:flush,report:report,enable:enable,status:status,version:VERSION}",'Launch diagnostics client missing');
includes('server/api/diagnostics.js','launch_diagnostics','Launch diagnostics API missing');
includes('api/mw.js',"'diagnostics': require('../server/api/diagnostics')",'Diagnostics API gateway route missing');
includes('vercel.json','"/api/diagnostics"','Diagnostics Vercel rewrite missing');
includes('coach/index.html','/assets/mw-diagnostics.js','Coach diagnostics client missing');
includes('athlete/index.html','/assets/mw-diagnostics.js','Athlete diagnostics client missing');
includes('account/index.html','/assets/mw-diagnostics.js','Account diagnostics client missing');
includes('supabase/migrations/20260921_launch_diagnostics.sql','mw_launch_diagnostics_insert_own','Diagnostics RLS insert policy missing');
includes('founder/index.html','FOUNDER OPERATING SYSTEM','Founder OS shell missing');
includes('founder/index.html','Website & Growth','Founder OS website center missing');
includes('founder/index.html','AI Company','Founder OS AI company missing');
includes('founder/index.html','MW Knowledge','Founder OS methodology center missing');
includes('server/api/founder.js','Founder / Owner access required','Founder API authorization gate missing');
includes('server/api/founder-ai.js','Founder / Owner access required','Founder AI authorization gate missing');
includes('server/api/founder-ai.js','Consequential actions must be prepared as approval requests','Founder AI human-approval guard missing');
includes('api/mw.js',"'founder': require('../server/api/founder')",'Founder API route missing');
includes('api/mw.js',"'founder/ai': require('../server/api/founder-ai')",'Founder AI route missing');
includes('assets/mw-web-analytics.js','mw_record_web_event','Website analytics client missing');
includes('supabase/migrations/20260920_founder_os_v1.sql','mw_founder_os_snapshot','Founder OS database snapshot RPC missing');
includes('supabase/migrations/20260920_founder_os_v1.sql','private.mw_is_founder()','Founder OS database role gate missing');
includes('supabase/migrations/20260920_founder_os_v1.sql','founder_ai_agents','Founder AI workforce schema missing');
includes('supabase/migrations/20260920_founder_os_v2_program_control.sql','mw_founder_program_control','Founder Program Control migration missing');
includes('supabase/migrations/20260920_founder_os_v3_ai_runs.sql','founder_ai_runs','Founder AI work-run audit table missing');
includes('supabase/migrations/20260920_founder_os_v4_management_intelligence.sql','mw_founder_customer_health','Founder customer-health intelligence missing');
includes('supabase/migrations/20260920_founder_os_v4_management_intelligence.sql','mw_founder_finance_snapshot','Founder finance intelligence missing');
includes('supabase/migrations/20260920_founder_os_v5_audit.sql','mw_audit_founder_os_change','Founder mutation audit trigger missing');
includes('supabase/migrations/20260920_founder_os_v6_operating_sops.sql','App Store / TestFlight Release Gate','Founder launch SOP seeds missing');
includes('supabase/migrations/20260920_founder_os_v7_launch_readiness.sql','mw_founder_launch_readiness','Founder launch-readiness RPC missing');
includes('supabase/migrations/20260920_founder_os_v8_launch_audit.sql','mw_audit_founder_launch_gates','Founder launch gate audit missing');
includes('supabase/migrations/20260920_founder_os_v9_launch_billing_gate.sql','internal_test_coach_entitlements','Founder launch billing gate correction missing');
includes('supabase/migrations/20260920_founder_os_v10_human_org_plan.sql','Chief Operating Officer','Founder human organization plan missing');
includes('founder/index.html','PEOPLE & ORGANIZATION','Founder People organization center missing');

includes('server/api/founder.js',"section==='launch'",'Founder launch-readiness API route missing');
includes('server/api/founder.js',"action==='update_launch_gate'",'Founder launch gate action missing');
includes('server/api/founder-ai.js',"mode==='triage_support'",'Founder support AI triage missing');
includes('founder/index.html','FULL LAUNCH READINESS','Founder Launch Readiness UI missing');
includes('founder/index.html','Customer Success Watch','Founder customer-success watch missing');
includes('founder/index.html','AI Support Triage','Founder support triage UI missing');

includes('server/api/founder-ai.js',"mode==='execute_task'",'Founder AI task execution mode missing');
includes('founder/index.html','Run AI','Founder AI task execution control missing');
includes('founder/index.html','OFFICIAL MW PROGRAM CONTROL','Founder Program Control UI missing');
includes('supabase/migrations/20260920_founder_os_v4_management_intelligence.sql','mw_founder_customer_health','Founder customer-health intelligence missing');
includes('supabase/migrations/20260920_founder_os_v4_management_intelligence.sql','mw_founder_support_triage_snapshot','Founder support triage migration missing');
includes('supabase/migrations/20260920_founder_os_v4_management_intelligence.sql','mw_founder_capture_kpi_snapshot','Founder KPI snapshot migration missing');
includes('supabase/migrations/20260920_founder_os_v5_audit.sql','mw_audit_founder_os_change','Founder OS audit trigger missing');
includes('supabase/migrations/20260920_founder_os_v6_operating_sops.sql','App Store / TestFlight Release Gate','Founder operating SOP seed missing');
includes('server/api/founder-ai.js',"mode==='triage_support'",'Support Manager AI triage mode missing');
includes('server/api/founder.js',"section==='customer_health'",'Founder customer-health API route missing');
includes('server/api/founder.js',"section==='kpi_history'",'Founder KPI history API route missing');
includes('founder/index.html','Run AI Triage','Founder support AI triage control missing');
includes('founder/index.html','Operating Contribution','Founder finance contribution view missing');
includes('founder/index.html','Visit → Signup','Founder website conversion funnel missing');
includes('assets/mw-web-analytics.js','if(NATIVE)return false','Website analytics must exclude native app sessions');
includes('account/index.html',"MWWebAnalytics?.track('checkout_start'",'Web checkout-start tracking missing');
includes('coach/app.js',"MWWebAnalytics?.track('signup_complete'",'Coach web application completion tracking missing');
includes('athlete/index.html','/assets/mw-web-analytics.js','Athlete web entry analytics missing');
includes('coach/index.html','/assets/mw-web-analytics.js','Coach web entry analytics missing');



const accountHtml=read('account/index.html');
ok((accountHtml.match(/<!doctype html>/gi)||[]).length===1,'Account page must contain exactly one document');
ok((accountHtml.match(/<\/html>/gi)||[]).length===1,'Account page must contain exactly one closing html tag');




const signup=read('athlete/signup.html');
ok(signup.includes('id="dob"')&&signup.includes('id="last"'),'athlete signup must collect last name and DOB');
ok(signup.includes('date_of_birth:dob'),'athlete signup must send DOB in auth metadata');
ok(signup.includes('ageAtLeast13'),'athlete signup must enforce 13+ before submit');
includes('privacy.html','users age 13 or older','privacy policy must state 13+ athlete eligibility');
includes('terms.html','at least 13 years old','terms must state 13+ athlete eligibility');
includes('supabase/migrations/20260915_disable_athlete_annual_until_approved.sql','annual_enabled = false','athlete annual billing must remain disabled');

const pricing=read('server/api/pricing.js');
ok(!pricing.includes('SUPABASE_SERVICE_ROLE_KEY'),'public pricing endpoint must never select the service-role key');
includes('server/api/pricing.js',"version:'3.0.16'",'pricing API version mismatch');
includes('server/api/status.js',"version:'mw-dynasty-3.0.16'",'status API version mismatch');

// Ensure no actual secret material is packaged.
function walk(dir){let out=[];for(const n of fs.readdirSync(dir)){const p=path.join(dir,n);const s=fs.statSync(p);if(s.isDirectory())out=out.concat(walk(p));else out.push(p)}return out}
const textExt=new Set(['.js','.html','.json','.txt','.md','.sql','.swift','.plist','.xcconfig','.pbxproj','.webmanifest']);
for(const f of walk(root)){if(!textExt.has(path.extname(f))&&!f.endsWith('project.pbxproj'))continue;const t=fs.readFileSync(f,'utf8');ok(!/sk-proj-[A-Za-z0-9_-]{12,}/.test(t),`OpenAI secret appears packaged in ${path.relative(root,f)}`);ok(!/sb_secret_[A-Za-z0-9_-]{12,}/.test(t),`Supabase secret appears packaged in ${path.relative(root,f)}`);}

// Local HTML asset/link integrity for launch pages.
const htmlFiles=walk(root).filter(f=>f.endsWith('.html'));
for(const f of htmlFiles){const t=fs.readFileSync(f,'utf8');const re=/(?:src|href)=["']([^"']+)["']/g;let m;while((m=re.exec(t))){const v=m[1];if(/^(?:https?:|mailto:|tel:|data:|javascript:|#)/.test(v))continue;const raw=v.split(/[?#]/)[0];if(!raw)continue;let target=raw.startsWith('/')?path.join(root,raw.slice(1)):path.resolve(path.dirname(f),raw);if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');ok(fs.existsSync(target),`Missing local link from ${path.relative(root,f)} -> ${v}`);}}

if(failures.length){console.error('MW launch integrity FAILED');for(const f of failures)console.error(' - '+f);process.exit(1)}
console.log('PASS: MW Dynasty V3.0.16 launch-integrity checks');
