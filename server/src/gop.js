'use strict';

class GopBuilder {
  constructor(streamId) { this.streamId = streamId; this.current = null; }
  add(frame, received, codecConfigVersion, discontinuity = null) {
    const keyframe = (frame.flags & 1) !== 0;
    let finalized = null;
    if (keyframe) finalized = this.finalize(true);
    if (!this.current) {
      if (!keyframe) return { finalized, accepted:false };
      this.current = {
        streamId:this.streamId, startPtsUs:frame.ptsUs, endPtsUs:frame.ptsUs,
        startServerEpochUs:received.epochUs, endServerEpochUs:received.epochUs,
        keyframePtsUs:frame.ptsUs, sequenceStart:frame.sequence, sequenceEnd:frame.sequence,
        encodedBufferCount:0, byteLength:0, codecConfigVersion, complete:true,
        sequenceGapCount:0, estimatedMissingBuffers:0, buffers:[]
      };
    }
    const g = this.current;
    if (discontinuity) { g.complete=false; g.sequenceGapCount++; g.estimatedMissingBuffers += discontinuity; }
    g.endPtsUs=frame.ptsUs; g.endServerEpochUs=received.epochUs; g.sequenceEnd=frame.sequence;
    g.encodedBufferCount++; g.byteLength += frame.payloadLength;
    g.buffers.push({ ptsUs:frame.ptsUs, flags:frame.flags, payload:frame.payload, sequence:frame.sequence,
      tabletTimestampNs:frame.tabletTimestampNs, serverReceiveMonotonicNs:received.monotonicNs });
    return { finalized, accepted:true };
  }
  finalize(complete = true) {
    const g=this.current; this.current=null;
    if (!g) return null;
    if (!complete) g.complete=false;
    return g;
  }
}

class GopReplayCache {
  constructor(maxSeconds=60, maxBytes=64*1024*1024) { this.maxAgeUs=BigInt(Math.round(maxSeconds*1e6)); this.maxBytes=maxBytes; this.gops=[]; this.bytes=0; }
  add(gop) { this.gops.push(gop); this.bytes += gop.byteLength; this.prune(); }
  prune() {
    const newest=this.gops.length ? this.gops[this.gops.length-1].endServerEpochUs : 0n;
    while (this.gops.length && (this.bytes > this.maxBytes || newest-this.gops[0].endServerEpochUs > this.maxAgeUs)) this.bytes -= this.gops.shift().byteLength;
  }
  query(start,end) { return this.gops.filter(g=>g.endServerEpochUs>=start && g.startServerEpochUs<=end); }
  getStats() { const seconds=this.gops.length ? Number(this.gops[this.gops.length-1].endServerEpochUs-this.gops[0].startServerEpochUs)/1e6 : 0; return {gops:this.gops.length,bytes:this.bytes,seconds:Math.max(0,seconds)}; }
}

module.exports = { GopBuilder, GopReplayCache };
