/** Diagnostic extraction of the existing batch solver. See source_manifest.json. */
async function workedPprBatchTraced(userIds, alpha, opts) {
  if (opts !== undefined && (opts === null || typeof opts !== "object" || Array.isArray(opts))) {
    throw new TypeError("PPR batch options must be an object.");
  }
  const options = opts || {};
  const tol = options.tol === undefined ? 1e-6 : options.tol;
  const maxIter = options.maxIter === undefined ? 500 : options.maxIter;
  const batchSize = options.batchSize === undefined ? 32 : options.batchSize;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError("alpha must be a finite link-following probability in [0, 1].");
  }
  if (!Number.isFinite(tol) || tol <= 0 || !Number.isInteger(maxIter) || maxIter < 1) {
    throw new RangeError("tol must be positive and maxIter must be a positive integer.");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 128) {
    throw new RangeError("PPR batchSize must be an integer from 1 to 128.");
  }
  if (options.onBatch !== undefined && typeof options.onBatch !== "function") {
    throw new TypeError("PPR batch onBatch must be a function.");
  }
  if (!Array.isArray(userIds)) throw new TypeError("PPR batch userIds must be an array of raw user IDs.");
  // Snapshot caller-owned arrays before the first await; a progress callback
  // cannot change which users are requested midway through the calculation.
  const ids = userIds.slice();
  if (!ids.length) return [];
  const graph = options.graph === undefined ? GRAPH : options.graph;
  if (!graph || typeof graph.nodeOfUser !== "function") {
    throw new Error("Build a training graph or supply opts.graph before running batched PPR.");
  }
  const normalized = rowNormalize(graph);
  const n = graph.nUsers + graph.nMovies;
  if (!n) throw new Error("Batched PPR requires at least one graph node.");
  const nodes = ids.map(userId => {
    const node = Number.isSafeInteger(userId) ? graph.nodeOfUser(userId) : -1;
    if (!Number.isInteger(node) || node < 0 || node >= graph.nUsers) {
      throw new RangeError("Unknown or invalid raw restart user ID: " + String(userId));
    }
    return node;
  });
  if (typeof tf === "undefined" || !tf.getBackend()) {
    throw new Error("TensorFlow.js must be ready before running batched PPR.");
  }

  let shared = null;
  const results = [];
  try {
    shared = tf.tidy(() => ({
      links: tf.tensor2d(graph.R, [graph.nUsers, graph.nMovies]),
      inverse: tf.tensor2d(Float32Array.from(normalized.inverseDegree), [n, 1]),
      dangling: tf.tensor2d(Float32Array.from(normalized.danglingMask, value => value ? 1 : 0), [n, 1])
    }));
    for (let start = 0; start < ids.length; start += batchSize) {
      const width = Math.min(batchSize, ids.length - start);
      const restartValues = new Float32Array(n * width);
      for (let col = 0; col < width; col++) restartValues[nodes[start + col] * width + col] = 1;
      const active = new Float32Array(width).fill(1);
      const residuals = new Float64Array(width).fill(Infinity);
      const iterations = new Uint32Array(width);
      const converged = new Array(width).fill(false);
      let remaining = width;
      let restart = null;
      let p = null;
      let batchResults;
      try {
        restart = tf.tensor2d(restartValues, [n, width]);
        p = restart.clone();
        for (let k = 0; k < maxIter && remaining > 0; k++) {
          const step = tf.tidy(() => {
            const weighted = p.mul(shared.inverse);
            const userMass = weighted.slice([0, 0], [graph.nUsers, width]);
            const movieMass = weighted.slice([graph.nUsers, 0], [graph.nMovies, width]);
            const incoming = tf.concat([
              tf.matMul(shared.links, movieMass),
              tf.matMul(shared.links, userMass, true, false)
            ], 0);
            // Sum over nodes independently for each restart column. A dangling
            // user's mass consequently returns to that same user, not a peer.
            const danglingMass = p.mul(shared.dangling).sum(0, true);
            const followed = incoming.add(restart.mul(danglingMass));
            // v + alpha * (followed - v) is the same restart equation. Correct
            // only Float32 mass drift before measuring consecutive residuals;
            // this avoids rounding cycles near the 1e-6 stopping threshold.
            const raw = restart.add(followed.sub(restart).mul(alpha));
            // A positive user seed alternates between the two partitions. Its
            // total user mass after t steps is known exactly, independently of
            // the edges: (1 + alpha * (-alpha)^t) / (1 + alpha). Enforce that
            // invariant to remove Float32 rounding cycles at high alpha.
            const userFraction = (1 + alpha * Math.pow(-alpha, k + 1)) / (1 + alpha);
            const targets = Float32Array.from(nodes.slice(start, start + width), node => graph.degree[node] ? userFraction : 1);
            const candidate = graphCorrectPartitionMass(raw, graph.nUsers, targets);
            const activeColumns = tf.tensor2d(active, [1, width]);
            const next = candidate.mul(activeColumns).add(p.mul(tf.onesLike(activeColumns).sub(activeColumns)));
            // Diagnostic observer only: the propagation and stopping code below are unchanged.
            if (typeof options.onTraceStep === "function") {
              options.onTraceStep({iteration:k+1, width, start, active, ids, nodes,
                pBefore:p, weighted, incoming, danglingMass, followed, raw, candidate, next,
                userTargets:targets, idealUserFraction:userFraction, inverse:shared.inverse});
            }
            return { next, residual: next.sub(p).abs().sum(0) };
          });
          p.dispose();
          p = step.next;
          let differences;
          try {
            differences = step.residual.dataSync();
          } finally {
            step.residual.dispose();
          }
          for (let col = 0; col < width; col++) {
            if (!active[col]) continue;
            const residual = differences[col];
            if (!Number.isFinite(residual)) throw new Error("Batched PPR produced a non-finite residual.");
            residuals[col] = residual;
            iterations[col] = k + 1;
            if (residual < tol) {
              converged[col] = true;
              active[col] = 0;
              remaining--;
            }
          }
          if ((k + 1) % 16 === 0 && remaining > 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const values = p.dataSync();
        batchResults = Array.from({ length: width }, (_, col) => {
          const probabilities = new Float64Array(n);
          for (let node = 0; node < n; node++) probabilities[node] = values[node * width + col];
          return {
            userId: ids[start + col], p: probabilities,
            iterations: iterations[col], residual: residuals[col], converged: converged[col]
          };
        });
      } finally {
        if (p) p.dispose();
        if (restart) restart.dispose();
      }
      results.push(...batchResults);
      if (options.onBatch) await options.onBatch(batchResults, results.length, ids.length);
      if (start + width < ids.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return results;
  } finally {
    if (shared) for (const tensor of Object.values(shared)) tensor.dispose();
  }
}


/** Compute and render trace evidence using only the existing data, graph and ranking functions. */
async function workedRun() {
  const button=document.getElementById('run-worked-example');
  const status=document.getElementById('worked-status');
  button.disabled=true;
  try {
    if (!HW6_STATE.loaded) throw new Error('Wait until the dataset status says ready.');
    const manifest=await (await fetch('results/user1_fargo_worked/source_manifest.json')).json();
    const savedCsv=await (await fetch('results/users_1_2/recommendations.csv')).text();
    // The exact reference value is checked against the previously saved CSV text as well as the result.
    const savedScore=0.0006855214014649391;
    if (!savedCsv.includes(String(savedScore))) throw new Error('Reference score missing from saved recommendations.');
    const graph=buildGraph(HW6_SPLIT.train);setGraph(graph);
    const alpha=.50, userId=1, movieId=100;
    const node=graph.nUsers+graph.movieIndexOf.get(movieId);
    const colIds=hw6SharedCohort('val').slice(0,32);
    const col=colIds.indexOf(userId);
    if(col<0)throw new Error('User 1 missing from original validation batch.');
    const liveBefore=tf.memory().numTensors;
    status.textContent='Running original 32-column batch and the observed copy...';
    const original=await personalizedPageRankBatch(colIds,alpha,{graph,batchSize:32,tol:1e-6,maxIter:500});
    const originalUser=original[col];
    let last=null;
    const history=[];
    const traced=await workedPprBatchTraced(colIds,alpha,{graph,batchSize:32,tol:1e-6,maxIter:500,
      onTraceStep(step){
        if(step.start!==0||!step.active[col])return;
        const width=step.width;
        const column=tensor=>{
          const values=tensor.dataSync();
          return Array.from({length:graph.nodeCount},(_,i)=>values[i*width+col]);
        };
        const pBefore=column(step.pBefore), incoming=column(step.incoming), raw=column(step.raw), next=column(step.next);
        const weighted=column(step.weighted);
        const inverse=Array.from(step.inverse.dataSync());
        const rawUsers=step.raw.slice([0,0],[graph.nUsers,width]);
        const rawMovies=step.raw.slice([graph.nUsers,0],[graph.nMovies,width]);
        // Re-evaluate the exact same Float32 reductions on the same raw tensor
        // to observe the normalizer denominators without changing the solver.
        const userSumTensor=rawUsers.sum(0,true), movieSumTensor=rawMovies.sum(0,true);
        const userSums=Array.from(userSumTensor.dataSync()), movieSums=Array.from(movieSumTensor.dataSync());
        const target=tf.tensor2d(step.userTargets,[1,width]);
        const movieTargets=Array.from(tf.onesLike(target).sub(target).dataSync());
        const dividedMovies=rawMovies.div(movieSumTensor.maximum(1e-20)).dataSync();
        const dividedFargo=dividedMovies[(node-graph.nUsers)*width+col];
        const dangling=step.danglingMass.dataSync()[col];
        const normalized=next[node];
        const neighbourTerms=[];
        for(let u=0;u<graph.nUsers;u++)if(graph.R[u][node-graph.nUsers])neighbourTerms.push({
          userId:graph.userIds[u],userNodeIndex:u,degree:graph.degree[u],
          probabilityBefore:pBefore[u],inverseDegreeFloat32:inverse[u],
          perLinkMassFloat32:weighted[u],perLinkMassFloat64Division:pBefore[u]/graph.degree[u]
        });
        last={iteration:step.iteration,previousFargoScore:pBefore[node],
          incomingMassFloat32:incoming[node],incomingTermsCount:neighbourTerms.length,
          incomingTermsFloat64Sum:neighbourTerms.reduce((a,t)=>a+t.perLinkMassFloat32,0),
          danglingMassTotalFloat32:dangling,restartAtFargo:0,
          danglingRedistributionBeforeAlpha:dangling*0,danglingContribution:alpha*dangling*0,
          restartContribution:(1-alpha)*0,linkContribution:alpha*incoming[node],
          rawFargoScoreFloat32:raw[node],
          normalization:{kind:'bipartite partition mass correction; float32 divide then multiply',
            idealUserTarget:step.idealUserFraction,userTargetFloat32:step.userTargets[col],
            movieTargetFloat32:movieTargets[col],rawUserPartitionSumFloat32:userSums[col],
            rawMoviePartitionSumFloat32:movieSums[col],
            denominatorLowerBound:1e-20,denominatorGuardActive:movieSums[col]<1e-20,
            fargoAfterFloat32Division:dividedFargo,
            idealScalarMovieCorrection:movieTargets[col]/movieSums[col],
            note:'Denominators are re-evaluations of the same reductions on raw; the final score is read from the original normalization output, not reconstructed from rounded display values.'},
          resultingFargoScore:normalized,normalizationDelta:normalized-raw[node],
          vectors:{pBefore,incoming,raw,pAfter:next},neighbourTerms};
        history.push({iteration:step.iteration,previousFargoScore:pBefore[node],incoming:incoming[node],raw:raw[node],
          rawMoviePartitionSum:movieSums[col],movieTarget:movieTargets[col],fargoScore:normalized});
      }
    });
    let maxDifference=0;
    for(let c=0;c<original.length;c++)for(let n=0;n<graph.nodeCount;n++)maxDifference=Math.max(maxDifference,Math.abs(original[c].p[n]-traced[c].p[n]));
    if(maxDifference!==0)throw new Error('Tracing changed probability outputs: '+maxDifference);
    if(last.iteration!==originalUser.iterations)throw new Error('Trace stopping iteration differs.');
    if(last.resultingFargoScore!==traced[col].p[node])throw new Error('Final trace cell differs from returned score.');
    HW6_STATE.pprProfiles.set(alpha,{graph,results:new Map(original.map(r=>[r.userId,r]))});
    const recs=recommendTopK('ppr',userId,10,'test');
    const excluded=hw6ExclusionSet('test',userId);
    const testGrades=HW6_STATE.gradesBySplit.test.get(userId);
    const relevant=Array.from(testGrades).filter(([id,rating])=>rating>=4&&HW6_STATE.candidateSet.has(id)&&!excluded.has(id))
      .sort((a,b)=>a[0]-b[0]).map(([id,rating])=>({movieId:id,title:hw6Title(id),genres:hw6Genres(id),testRating:rating}));
    const relevantIds=new Set(relevant.map(r=>r.movieId));
    const top10=recs.map((r,i)=>({...r,rank:i+1,testRating:testGrades.has(r.movieId)?testGrades.get(r.movieId):'unknown',hit:relevantIds.has(r.movieId)}));
    const hits=top10.filter(r=>r.hit);
    const trainFargo=HW6_SPLIT.train.filter(r=>r.userId===userId&&r.movieId===movieId);
    const valFargo=HW6_SPLIT.val.filter(r=>r.userId===userId&&r.movieId===movieId);
    const testFargo=HW6_SPLIT.test.filter(r=>r.userId===userId&&r.movieId===movieId);
    const liveAfter=tf.memory().numTensors;
    const payload={userId,movieId,title:hw6Title(movieId),alpha,
      runtime:{tensorflowVersion:tf.version.tfjs,backend:tf.getBackend(),dtype:'float32',
        batchSize:32,batchUserIds:colIds,targetColumn:col,tolerance:1e-6,maxIterations:500,
        iterations:originalUser.iterations,residual:originalUser.residual,converged:originalUser.converged,
        tensorsBefore:liveBefore,tensorsAfter:liveAfter},
      graph:{nUsers:graph.nUsers,nMovies:graph.nMovies,nodeCount:graph.nodeCount,positiveEdges:graph.positiveEdges,
        userNodeIndex:graph.nodeOfUser(userId),movieNodeIndex:node,fargoDegree:graph.degree[node],
        zeroDegreeUsers:graph.zeroDegreeUsers,zeroDegreeMovies:graph.zeroDegreeMovies,
        userIds:graph.userIds,movieIds:graph.movieIds},
      finalIteration:last,history,
      parity:{instrumentedVsOriginalMaxAbsoluteDifference:maxDifference,
        savedFargoScore:savedScore,recomputedFargoScore:originalUser.p[node],
        differenceFromSaved:originalUser.p[node]-savedScore,
        exactlyMatchesSaved:originalUser.p[node]===savedScore},
      eligibility:{inTrainingCandidatePool:HW6_STATE.candidateSet.has(movieId),
        trainFargoRows:trainFargo,valFargoRows:valFargo,testFargoRows:testFargo,
        excluded:excluded.has(movieId),rank:top10.find(r=>r.movieId===movieId)?.rank,
        userInCommonTestCohort:hw6SharedCohort('test').includes(userId),
        userTrainRatings:HW6_SPLIT.train.filter(r=>r.userId===userId).length,
        userValRatings:HW6_SPLIT.val.filter(r=>r.userId===userId).length,
        userTestRatings:HW6_SPLIT.test.filter(r=>r.userId===userId).length,
        eligibleCandidates:HW6_STATE.candidateIds.filter(id=>!excluded.has(id)).length},
      top10,hits,eligibleRelevantTestMovies:relevant,
      recall:{hits:hits.length,relevant:relevant.length,value:hits.length/relevant.length},
      formula:'p_next = alpha * (Q^T p + d v) + (1-alpha) v; p_0=v, v is one-hot at user 1',
      manifest};
    if(hits.length!==3||relevant.length!==19||top10[0].movieId!==100)throw new Error('Ranking or relevance differs from expected; inspect output.');
    document.getElementById('trace-json').textContent=JSON.stringify(payload,null,2);
    document.getElementById('trace-summary').textContent=JSON.stringify({runtime:payload.runtime,finalIteration:{...last,vectors:'saved in JSON',neighbourTerms:'377 individual terms saved in JSON'},parity:payload.parity,eligibility:payload.eligibility,hits:payload.hits,recall:payload.recall},null,2);
    status.textContent='Complete. Saved-score difference: '+payload.parity.differenceFromSaved+'; Recall@10: '+hits.length+'/'+relevant.length+' = '+payload.recall.value;
  }catch(error){status.textContent='Trace failed: '+error.message;console.error(error);}
  finally{button.disabled=false;}
}
document.addEventListener('DOMContentLoaded',()=>document.getElementById('run-worked-example').addEventListener('click',workedRun));
