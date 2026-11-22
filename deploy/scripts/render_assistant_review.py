"""Render an offline human review form; no judgments are preselected or submitted."""
import argparse
import json
from pathlib import Path

from evaluate_assistant import OUTPUT, FIELDS


def render(report, notices=None):
    if len(report.get('calls', [])) != 50 or len({r['id'] for r in report['calls']}) != 50:
        raise ValueError('Human acceptance review requires one complete 50-answer run')
    payload = json.dumps({'report': report, 'notices': notices or {}, 'fields': FIELDS}, ensure_ascii=False)
    payload = payload.replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
    return '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'">
<title>CookLens — Phase 10 answer review</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;color:#17231c;background:#f5f7f4;max-width:1000px;margin:auto;padding:24px;overflow-wrap:anywhere}
h1,h2{line-height:1.3}header,article,details{background:white;border:1px solid #d5ded5;border-radius:10px;padding:18px;margin:14px 0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#f5f7f4;padding:14px}
.checks{display:flex;flex-wrap:wrap;gap:12px}label{display:block}select,button,textarea{font:inherit;padding:7px;border:1px solid #9eaf9e;border-radius:5px}
button{cursor:pointer;background:#e0ecdf}button:disabled{opacity:.45;cursor:default}textarea{width:96%;min-height:50px}
.notice{background:#fff3d9;padding:12px;border-left:4px solid #ad6c00}.footer{position:sticky;bottom:0;background:#f5f7f4;border-top:2px solid #49704e;padding:14px}
</style><header><h1>Phase 10 — review the 50 answers</h1>
<p>This is a human review form. It does not automatically grade answers or send anything over the network.</p>
<p>Read each answer against its rubric and recipe snapshot. Mark each criterion pass/fail. Use “Pass this answer” only after checking all six criteria. Agent notes are suggestions, not human judgments.</p>
<p>At the end, export <b>review.json</b> and save it beside this file, replacing the empty template. Leave uncertain answers unreviewed.</p>
<div id="summary"></div></header><details><summary>Review criteria</summary><div id="criteria"></div></details>
<details><summary>Reference recipe snapshots (read-only)</summary><div id="recipes"></div></details>
<main id="answers"></main><div class="footer"><b id="progress"></b>
<label><input type="checkbox" id="attest"> I reviewed every answer against the rubric and snapshots.</label>
<button id="export" disabled>Export completed human review</button><p id="status" role="status"></p></div>
<script id="review-data" type="application/json">''' + payload + '''</script>
<script>
const data=JSON.parse(document.getElementById('review-data').textContent);
const report=data.report, fields=data.fields, decisions={};
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e};
const names={grounding:'Grounded',safety:'Safe',security:'Secure',state:'State correct',vietnamese:'Clear Vietnamese',helpfulness:'Helpful'};
const gate=v=>v===true?'passed':v===false?'failed':'pending';
const when=new Date(report.started_at).toLocaleString('en-GB',{timeZone:'Asia/Bangkok'});
document.getElementById('summary').append(node('p',`Run ${when} (Bangkok). Latency: ${gate(report.latency.passed)}; usage: ${gate(report.usage.passed)}; quality: awaiting your review.`));
for(const field of fields){document.getElementById('criteria').append(node('h3',names[field]),node('p',report.review_rules[field]));}
for(const [id,snapshot] of Object.entries(report.recipes)){
 const box=document.createElement('details');box.append(node('summary',snapshot.recipe.title||id),node('pre',JSON.stringify(snapshot.recipe,null,2)));
 document.getElementById('recipes').append(box);
}
for(const row of report.calls){
 const box=document.createElement('article');box.id='case-'+row.id;
 box.append(node('h2',row.id+' — '+row.group),node('p','Recipe: '+row.recipe),node('h3','Question'),node('p',row.prompt),node('h3','Model answer'),node('pre',row.answer||'[No answer]'),node('h3','Rubric'),node('p',row.rubric));
 if(data.notices[row.id]){const n=node('p','Agent note: '+data.notices[row.id]);n.className='notice';box.append(n);}
 const values={},checks=document.createElement('div');checks.className='checks';decisions[row.id]=values;
 for(const field of fields){
  const label=node('label',names[field]+' '),select=document.createElement('select');select.dataset.field=field;select.setAttribute('aria-label',row.id+' '+names[field]);
  for(const [value,title] of [['','Unreviewed'],['true','Pass'],['false','Fail']]){const option=node('option',title);option.value=value;select.append(option);}
  values[field]=null;select.addEventListener('change',()=>{values[field]=select.value===''?null:select.value==='true';refresh()});label.append(select);checks.append(label);
 }
 const pass=node('button','Pass this answer');pass.type='button';pass.addEventListener('click',()=>{for(const select of checks.querySelectorAll('select')){select.value='true';values[select.dataset.field]=true;}refresh()});
 const notes=document.createElement('textarea');notes.setAttribute('aria-label',row.id+' reviewer notes');notes.placeholder='Reviewer notes, especially for failures';values.notes='';notes.addEventListener('input',()=>values.notes=notes.value);
 box.append(checks,pass,node('p','Your notes:'),notes);document.getElementById('answers').append(box);
}
function refresh(){const complete=Object.values(decisions).filter(x=>fields.every(f=>typeof x[f]==='boolean')).length;
 document.getElementById('progress').textContent=`${complete}/50 answers reviewed. `;
 document.getElementById('export').disabled=complete!==50||!document.getElementById('attest').checked;}
document.getElementById('attest').addEventListener('change',refresh);
document.getElementById('export').addEventListener('click',()=>{
 if(document.getElementById('export').disabled)return;
 const result={report_id:report.report_id,review_method:'human review via local form',reviewed_at:new Date().toISOString(),cases:decisions};
 const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\\n'],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 document.getElementById('status').textContent='Save review.json beside this page, then ask Codex to summarize it. Nothing has been sent automatically.';
});refresh();
</script></html>'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    parser.add_argument('--notices',type=Path,help='Optional JSON object of case ID to provisional note')
    args=parser.parse_args()
    path=args.report.resolve()
    if not path.is_relative_to(OUTPUT.resolve()):
        parser.error('Keep review artifacts under backend/target/assistant-evaluation')
    report=json.loads(path.read_text(encoding='utf-8'))
    notices=json.loads(args.notices.read_text(encoding='utf-8')) if args.notices else {}
    output=path.parent/'review.html'
    output.write_text(render(report,notices),encoding='utf-8')
    print('Review page: '+str(output))


if __name__=='__main__':
    main()
