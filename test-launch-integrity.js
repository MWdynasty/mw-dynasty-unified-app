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
