"""Verify the captured browser trace and build the report-ready worked example.

Run with a Python environment containing NumPy after trace.html has produced
intermediates.json. No training data, production code, or final results change.
"""
from pathlib import Path
from collections import defaultdict
import csv
import hashlib
import html
import json
import math
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TRACE = HERE / 'intermediates.json'
x = json.loads(TRACE.read_text())
step = x['finalIteration']
norm = step['normalization']
before, after = step['vectors']['pBefore'], step['vectors']['pAfter']
for name, sha in x['manifest']['sourceSha256'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha, name

records = defaultdict(list)
for line_no, line in enumerate((ROOT / 'u.data').read_text().splitlines(), 1):
    u, m, r, t = map(int, line.split())
    records[u].append({'userId': u, 'movieId': m, 'rating': r, 'timestamp': t, 'uDataLine': line_no})
parts = {name: [] for name in ['train', 'val', 'test']}
for uid, rs in records.items():
    if len(rs) < 5:
        continue
    ordered = sorted(rs, key=lambda r: (r['timestamp'], r['movieId']))
    nt, nv = math.floor(.8 * len(rs)), math.floor(.1 * len(rs))
    for name, group in [('train', ordered[:nt]), ('val', ordered[nt:nt+nv]), ('test', ordered[nt+nv:])]:
        parts[name].extend(group)
candidates = {r['movieId'] for r in parts['train']}
positive_pairs = {(r['userId'], r['movieId']) for r in parts['train'] if r['rating'] >= 4}
edge_sha = hashlib.sha256(''.join(f'{u},{m}\n' for u,m in sorted(positive_pairs)).encode()).hexdigest()
assert edge_sha == json.loads((ROOT / 'results/ppr_demonstration/experiment.json').read_text())['graph']['edgeSha256']
blocked = {r['movieId'] for name in ['train','val'] for r in parts[name] if r['userId'] == 1}
test = [r for r in parts['test'] if r['userId'] == 1]
relevant = sorted((r for r in test if r['rating'] >= 4 and r['movieId'] in candidates and r['movieId'] not in blocked), key=lambda r:r['movieId'])
assert len(relevant) == 19 and len(test) == 28
assert sum(r['rating'] >= 4 for r in test) == 19
assert sum(r['rating'] < 4 for r in test) == 9
assert [r['movieId'] for r in relevant] == [r['movieId'] for r in x['eligibleRelevantTestMovies']]
assert 100 in candidates and 100 not in blocked
assert next(r for r in test if r['movieId'] == 100)['rating'] == 5
assert len(positive_pairs) == 45602

user_index = {uid:i for i,uid in enumerate(x['graph']['userIds'])}
movie_index = {mid:i+x['graph']['nUsers'] for i,mid in enumerate(x['graph']['movieIds'])}
degree = defaultdict(int)
for u,m in positive_pairs:
    degree[user_index[u]] += 1
    degree[movie_index[m]] += 1
assert step['incomingTermsCount'] == len(step['neighbourTerms']) == 377
expected_neighbours = sorted(u for u,m in positive_pairs if m == 100)
assert [r['userId'] for r in step['neighbourTerms']] == expected_neighbours
for term in step['neighbourTerms']:
    assert term['degree'] == degree[term['userNodeIndex']]
    assert term['probabilityBefore'] == before[term['userNodeIndex']]
    assert term['inverseDegreeFloat32'] == float(np.float32(1/term['degree']))
    assert term['perLinkMassFloat32'] == float(np.float32(np.float32(term['probabilityBefore']) * np.float32(term['inverseDegreeFloat32'])))
assert step['rawFargoScoreFloat32'] == float(np.float32(.5 * step['incomingMassFloat32']))
divided = np.float32(np.float32(step['rawFargoScoreFloat32']) / np.float32(norm['rawMoviePartitionSumFloat32']))
normalized = float(np.float32(divided * np.float32(norm['movieTargetFloat32'])))
assert float(divided) == norm['fargoAfterFloat32Division']
assert normalized == step['resultingFargoScore'] == x['parity']['savedFargoScore']
assert x['parity']['differenceFromSaved'] == 0
assert x['parity']['instrumentedVsOriginalMaxAbsoluteDifference'] == 0
assert x['runtime']['iterations'] == 21 and x['runtime']['residual'] < 1e-6
assert x['runtime']['tensorsBefore'] == x['runtime']['tensorsAfter'] == 0

# Independently rank every eligible candidate using the captured final vector.
eligible = sorted(candidates - blocked, key=lambda m:(-after[movie_index[m]],m))
assert len(eligible) == 1367 and eligible[0] == 100
assert eligible[:10] == [r['movieId'] for r in x['top10']]
with (ROOT/'results/users_1_2/recommendations.csv').open(encoding='utf-8',newline='') as f:
    saved = [r for r in csv.DictReader(f) if r['user_id']=='1' and r['method']=='ppr' and r['alpha']=='0.50']
assert [(int(r['movie_id']), float(r['score'])) for r in saved] == [(r['movieId'], r['score']) for r in x['top10']]
relevant_ids = {r['movieId'] for r in relevant}
hit_ids = [m for m in eligible[:10] if m in relevant_ids]
assert hit_ids == [100,258,222]
assert x['recall']['value'] == 3/19

# An independent float64 iteration is a precision cross-check, not a replacement
# for the existing TensorFlow.js path or its recorded intermediate values.
pairs = sorted(positive_pairs)
src = np.array([user_index[u] for u,m in pairs] + [movie_index[m] for u,m in pairs])
dst = np.array([movie_index[m] for u,m in pairs] + [user_index[u] for u,m in pairs])
n = x['graph']['nodeCount']
degrees = np.bincount(src,minlength=n)
v = np.zeros(n); v[user_index[1]] = 1
p = v.copy()
for iteration in range(1,501):
    incoming = np.bincount(dst,weights=p[src]/degrees[src],minlength=n)
    nxt = .5*(incoming+p[degrees==0].sum()*v)+.5*v
    residual = float(np.abs(nxt-p).sum()); p=nxt
    if residual < 1e-6:
        break
float64_score = float(p[movie_index[100]])
assert abs(float64_score-normalized) < 1e-8

terms_sum = math.fsum(t['perLinkMassFloat32'] for t in step['neighbourTerms'])
relevant_details = []
for raw in relevant:
    meta = next(r for r in x['eligibleRelevantTestMovies'] if r['movieId'] == raw['movieId'])
    relevant_details.append(dict(meta,timestamp=raw['timestamp'],uDataLine=raw['uDataLine'],inCandidatePool=True,excluded=False,hit=raw['movieId'] in hit_ids))
x['independentAudit'] = {
    'verifiedBy':'agent; student personal verification has not been claimed',
    'trainingGraphEdgeSha256':edge_sha,
    'splitCounts':{name:len(rs) for name,rs in parts.items()},
    'user1TestRatings':test,
    'user1TrainMovieIds':sorted(r['movieId'] for r in parts['train'] if r['userId']==1),
    'user1ValidationMovieIds':sorted(r['movieId'] for r in parts['val'] if r['userId']==1),
    'eligibleRelevantTestMoviesWithRawSourceLines':relevant_details,
    'fullEligibleCandidateRankingVerified':True,'eligibleCandidates':len(eligible),
    'fargoRank':eligible.index(100)+1,'candidatesStrictlyAboveFargo':0,
    'allTenMovieIdsAndExactScoresMatchSavedList':True,
    'normalizationReproducedWithFloat32DivideThenMultiply':True,
    'incomingEdgeTermsFloat64Sum':terms_sum,
    'gpuIncomingMinusFloat64SumOfCapturedTerms':step['incomingMassFloat32']-terms_sum,
    'float64SumOfCapturedPreviousVector':math.fsum(before),
    'float64SumOfCapturedFinalVector':math.fsum(after),
    'float64L1BetweenCapturedVectors':math.fsum(abs(a-b) for a,b in zip(after,before)),
    'independentFloat64Run':{'iterations':iteration,'finalResidual':residual,'fargoScore':float64_score,
                            'differenceFromSaved':float64_score-x['parity']['savedFargoScore'],
                            'note':'Full float64 edge-list iteration with the same p0, restart and tolerance, without Float32 partition corrections; used only as an independent cross-check.'},
    'diagnosticCodeSha256':{name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['trace.js','trace.html']},
}
TRACE.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def write_csv(name,columns,rows):
    with (HERE/name).open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader();writer.writerows(rows)
write_csv('incoming_contributions.csv',list(step['neighbourTerms'][0]),step['neighbourTerms'])
write_csv('eligible_relevant_test_movies.csv',
          ['movie_id','title','test_rating','timestamp','u_data_line','in_candidate_pool','excluded','hit'],
          [{'movie_id':r['movieId'],'title':r['title'],'test_rating':r['testRating'],'timestamp':r['timestamp'],'u_data_line':r['uDataLine'],'in_candidate_pool':True,'excluded':False,'hit':r['hit']} for r in relevant_details])

esc=lambda value:html.escape(str(value))
def source(file,line,label):
    return f'<a href="../../{file}#L{line}">{esc(file)}:{line} — {esc(label)}</a>'
components=[
 ('Previous Fargo probability, p100^(20)',step['previousFargoScore']),
 ('Incoming mass, (Qᵀ p^(20))100',step['incomingMassFloat32']),
 ('Total dangling mass d20',step['danglingMassTotalFloat32']),
 ('Fargo dangling contribution α d20 v100',step['danglingContribution']),
 ('Fargo restart contribution (1−α) v100',step['restartContribution']),
 ('Raw Fargo probability r100 = α × incoming',step['rawFargoScoreFloat32']),
 ('Raw user-partition sum (Float32 reduction)',norm['rawUserPartitionSumFloat32']),
 ('Raw movie-partition sum SM (Float32 reduction)',norm['rawMoviePartitionSumFloat32']),
 ('Target user mass U21 (Float32)',norm['userTargetFloat32']),
 ('Target movie mass M21 (Float32)',norm['movieTargetFloat32']),
 ('Float32(r100 / SM)',norm['fargoAfterFloat32Division']),
 ('Final Fargo score p100^(21)',normalized),
 ('Normalization change, final − raw',step['normalizationDelta']),
 ('Difference from the saved Fargo score',x['parity']['differenceFromSaved']),
]
component_rows=''.join(f'<tr><th scope="row">{esc(label)}</th><td><code>{esc(value)}</code></td></tr>' for label,value in components)
hit_rows=''.join(f'<tr><td>{r["rank"]}</td><td>{r["movieId"]}</td><td>{esc(r["title"])}</td><td>{r["testRating"]}</td><td><code>{r["score"]}</code></td></tr>' for r in x['hits'])
relevant_rows=''.join(f'<tr><td>{r["movieId"]}</td><td>{esc(r["title"])}</td><td>{r["testRating"]}</td><td>{"yes" if r["hit"] else "no"}</td><td>{r["uDataLine"]}</td></tr>' for r in relevant_details)
top_rows=''.join(f'<tr><td>{r["rank"]}</td><td>{r["movieId"]}</td><td>{esc(r["title"])}</td><td>{esc(", ".join(r["genres"]))}</td><td><code>{r["score"]}</code></td><td>{r["popularity"]}</td><td>{r["testRating"]}</td><td>{"yes" if r["hit"] else "no"}</td></tr>' for r in x['top10'])
preamble=json.loads((ROOT/'results/report_preamble.json').read_text())
mu=preamble['orderedValues'][3]['value']; popularity_recall=preamble['orderedValues'][4]['value']
report=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HW6 worked example — User 1, Fargo, PPR α = 0.50</title><style>
body{{font:15px/1.55 system-ui,sans-serif;color:#21373b;background:#f5f8f8;margin:0}}main{{max-width:1280px;margin:auto;padding:26px 24px}}h1{{font-size:29px;line-height:1.25;margin:0 0 14px}}h2{{font-size:21px}}section{{background:white;border:1px solid #d3dfe0;border-radius:12px;margin:20px 0;padding:20px}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{padding:8px 10px;border-bottom:1px solid #dde6e7;text-align:left;vertical-align:top}}th{{background:#eef5f4}}a{{color:#22665f}}nav{{display:flex;flex-wrap:wrap;gap:8px 22px}}.scroll{{overflow-x:auto}}.tag{{display:inline-block;background:#e3f1ed;color:#255a52;padding:5px 10px;border-radius:20px;margin:3px 8px 4px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 ui-monospace,monospace;background:#eef5f4;padding:14px;border-radius:8px}}code{{font-family:ui-monospace,monospace}}small{{color:#52676a}}li{{margin:7px 0}}@media(max-width:600px){{main{{padding:18px 12px}}section{{padding:14px}}h1{{font-size:24px}}}}
</style></head><body><main>
<h1>Worked numerical example: user 1 → Fargo (100)</h1>
<p>PPR with α = 0.50 on the existing positive-training graph; standard test filtering. This is a report subsection and an agent-prepared verification example, not a claim of student personal verification.</p>
<p><span class="tag">Exact match to saved score</span><span class="tag">Test filtering verified</span><span class="tag">Recall calculation verified</span></p>
<nav><a href="intermediates.json">Machine-readable intermediate values</a><a href="incoming_contributions.csv" download>All 377 incoming contributions</a><a href="eligible_relevant_test_movies.csv" download>All 19 relevant test movies</a><a href="trace.html">Reproduce browser computation</a></nav>
<section><h2>Setup and baseline context</h2>
<p>Train / validation / test: <strong>79,619 / 9,596 / 10,785 ratings</strong>. The split is chronological within each user, with timestamp ties resolved by movie ID, floor(0.8n) training ratings, floor(0.1n) validation ratings, and the remainder in test. Source: {source('data.js',145,'splitByTimestamp()')}.</p>
<p>The mean of all observed training ratings is <strong>μ = {mu}</strong> = 285,084 / 79,619. Source: {source('script.js',948,'mean calculation inside hw6TrainMf()')}. The popularity baseline test Recall@10 is <strong>{popularity_recall}</strong>, macro-averaged over 861 common test users with the same 1,611 training-movie candidates and standard exclusions. Source: {source('script.js',1250,"recallAtK('popularity', 10, 'test')")} and <a href="../report_preamble.json">saved baseline evidence</a>.</p>
<p>The training graph has 943 user nodes, 1,611 movie nodes and 45,602 undirected positive edges (training ratings ≥ 4.0). User 1 maps to node 0; Fargo maps to node 1042 and has 377 positive-training neighbours. There is no user-1→Fargo training edge. Source: {source('graph.js',359,'buildGraph()')} and {source('graph.js',435,'rowNormalize()')}.</p>
<p>TensorFlow.js {x['runtime']['tensorflowVersion']}, WebGL, Float32. The original 32-user batch is reproduced with user 1 in column 0; p₀ = v, tolerance 10⁻⁶, cap 500. User 1 stops at iteration <strong>21</strong>, with L1 residual <strong>{x['runtime']['residual']}</strong>. The observed copy and original solver match at every returned entry across all 32 columns; live tensors before/after are 0/0. Source: {source('graph.js',588,'personalizedPageRankBatch()')}.</p></section>
<section><h2>Update formula and final iteration</h2>
<pre>r^(t+1) = α (Qᵀ p^t + d_t v) + (1 − α) v
d_t = sum of p^t over zero-degree nodes; v = one-hot at user 1
I100 = sum over 377 users u linked to Fargo of p_u^(20) / degree(u)
v100 = 0; α = 0.50</pre>
<p>Q divides each source node’s mass equally across its positive training links. The implementation uses rounded Float32 inverse degrees, multiplication and matrix reduction. The actual incoming TensorFlow.js value at Fargo is <strong>{step['incomingMassFloat32']}</strong>. Total dangling mass is zero, so Fargo receives zero dangling redistribution. Its restart entry is also zero: restart sends probability to user 1, not directly to Fargo. Source: {source('graph.js',656,'weighted outgoing mass and incoming matrix multiplication')}, {source('graph.js',665,'dangling mass')} and {source('graph.js',670,'restart update')}.</p>
<pre>r100 = 0.50 × ({step['incomingMassFloat32']} + 0) + 0
     = {step['rawFargoScoreFloat32']}</pre>
<p>Before measuring the residual, this implementation corrects Float32 drift separately in the user and movie partitions. The exact-arithmetic target user mass for a positive user restart after t steps is U_t = (1 + α(−α)^t)/(1 + α); the movie target is M_t = 1 − U_t. At t = 21, U₂₁ = {norm['userTargetFloat32']} and M₂₁ = {norm['movieTargetFloat32']}. The normalizer uses the Float32 movie sum S_M = {norm['rawMoviePartitionSumFloat32']}; the 10⁻²⁰ denominator guard is inactive. Source: {source('graph.js',675,'finite-iteration partition target')} and {source('graph.js',730,'graphCorrectPartitionMass()')}.</p>
<pre>p100^(21) = Float32( Float32(r100 / S_M) × M21 )
           = Float32( {norm['fargoAfterFloat32Division']} × {norm['movieTargetFloat32']} )
           = {normalized}
Saved score = {x['parity']['savedFargoScore']}
Difference  = {x['parity']['differenceFromSaved']}</pre>
<div class="scroll"><table><thead><tr><th>Actual final-iteration component</th><th>Value</th></tr></thead><tbody>{component_rows}</tbody></table></div>
<p>The correction changes Fargo’s raw value by {step['normalizationDelta']}, one Float32 spacing at this magnitude. No additional global normalization is applied on this positive-user-seed path. Partition denominators in the observer are re-evaluated with the same Float32 reductions on the same raw tensor; the reported final score is read directly from the original normalization output.</p></section>
<section><h2>Eligibility, rank and held-out hit</h2>
<p>User 1 has 217 training, 27 validation and 28 test ratings. Fargo appears in the training-movie candidate pool through other users, but user 1 rated it in neither training nor validation. It therefore survives the exclusion set of 244 previously rated movies. There are 1,367 eligible candidates, and none has a higher PPR score: Fargo ranks <strong>1st</strong>. The held-out test record is user 1, movie 100, rating <strong>5</strong>, timestamp 878543541 ({source('u.data',next(r['uDataLine'] for r in test if r['movieId']==100),'raw test observation')}). Its rating meets the ≥ 4 relevance threshold, so it counts as a hit. Held-out grades are used for evaluation after scoring and ranking.</p>
<p>Sources: {source('script.js',678,'hw6ExclusionSet()')}, {source('script.js',1197,'recommendTopK()')} and {source('script.js',1250,'recallAtK() relevance and hit rules')}. The complete eligible-pool ranking was checked independently against the captured final vector, and all ten IDs and exact scores match the <a href="../users_1_2/recommendations.csv">saved final recommendations</a>, including Fargo at CSV line 42.</p>
<div class="scroll"><table><thead><tr><th>Rank</th><th>Movie ID</th><th>Title</th><th>Genres</th><th>PPR score</th><th>Training popularity</th><th>Test rating</th><th>Hit</th></tr></thead><tbody>{top_rows}</tbody></table></div>
<p>Unknown ratings are unobserved; the seven unknown Top-10 movies are not labeled as dislikes.</p></section>
<section><h2>The three Top-10 hits and Recall@10</h2>
<div class="scroll"><table><thead><tr><th>Rank</th><th>Movie ID</th><th>Hit title</th><th>Held-out test rating</th><th>PPR score</th></tr></thead><tbody>{hit_rows}</tbody></table></div>
<p>The relevant set below contains all <strong>19</strong> test movies with rating ≥ 4 that belong to the training candidate pool and survive user 1’s training/validation exclusions. All 19 pass both filters; the other nine of user 1’s 28 test ratings are below 4. The retrieved relevant set is {{100, 258, 222}}.</p>
<pre>Recall@10(user 1) = |Top10 ∩ eligible relevant test movies| / |eligible relevant test movies|
                 = 3 / 19
                 = 0.15789473684210525 ≈ 0.1578947</pre>
<p>This is an individual-user recall, distinct from the cohort macro-average. Source: {source('script.js',1250,'recallAtK()')}.</p>
<div class="scroll"><table><thead><tr><th>Movie ID</th><th>Eligible relevant test title</th><th>Test rating</th><th>Top-10 hit</th><th>Raw u.data line</th></tr></thead><tbody>{relevant_rows}</tbody></table></div></section>
<section><h2>Numerical differences and reproducibility</h2>
<p>The Float32 WebGL rerun matches the saved Fargo value exactly (difference 0), and the instrumented and uninstrumented batch runs have maximum absolute difference 0 across all entries. The normalization correction is included in the worked arithmetic, not omitted.</p>
<p>Summing the 377 captured Float32 per-link terms in Float64 gives {terms_sum}; the actual GPU incoming value is {step['incomingMassFloat32']}, a difference of {step['incomingMassFloat32']-terms_sum}. This is the observed matrix-reduction rounding difference. The independent full Float64 solver stops after {iteration} iterations and gives Fargo score {float64_score}, differing from the saved Float32 result by {float64_score-normalized}. It is a precision cross-check, not the reported production score.</p>
<p>The Float64 sum of the captured final Float32 node values is {math.fsum(after)}. Thus the mass correction preserves the intended partition targets to numerical tolerance; it does not make a Float64 sum of rounded outputs exactly one.</p>
<p><a href="intermediates.json">intermediates.json</a> contains the complete previous, incoming, raw and next vectors for the last step, all 377 neighbour terms, every iteration’s Fargo values, original/source hashes, node mapping, all 28 user-1 test records, the 19 relevant rows and raw data line numbers, and all parity and independent checks. <a href="source_manifest.json">source_manifest.json</a> records how the diagnostic observer was derived from the existing solver; <a href="trace.js">trace.js</a> leaves its arithmetic and stopping rule unchanged.</p>
<ol><li>Serve the week6 directory over HTTP and open <a href="trace.html">trace.html</a>.</li><li>After the dataset is ready, press “Compute worked example”. The page runs the original batch and the observed copy and displays the full JSON. Save the JSON as intermediates.json in this folder.</li><li>Run build_report.py with Python and NumPy to verify the raw-file split, all incoming edges, Float32 normalization, full eligible ranking, three hits and denominator, and regenerate this report subsection and CSV tables.</li></ol>
<p><small>All checks described here were performed by the agent. This worksheet supports later student review; no student personal verification or full assignment submission readiness is claimed. The main application and previously saved final-evaluation artifacts were not changed.</small></p></section></main></body></html>'''
(HERE/'index.html').write_text(report,encoding='utf-8')
print(json.dumps({'report':str(HERE/'index.html'),'machineReadable':str(TRACE),'savedDifference':x['parity']['differenceFromSaved'],
                  'finalIteration':x['runtime']['iterations'],'score':normalized,'hits':hit_ids,'relevantCount':len(relevant),
                  'recall':3/19,'independentFloat64Score':float64_score,'float64DifferenceFromSaved':float64_score-normalized,
                  'fargoRawDataLine':next(r['uDataLine'] for r in test if r['movieId']==100)},indent=2))
