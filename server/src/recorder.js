'use strict';

const fs = require('fs');
const path = require('path');

function u8(...v){ return Buffer.from(v); }
function u16(v){ const b=Buffer.alloc(2); b.writeUInt16BE(v); return b; }
function u32(v){ const b=Buffer.alloc(4); b.writeUInt32BE(v>>>0); return b; }
function str(v){ return Buffer.from(v, 'ascii'); }
function box(type, ...parts){ const body=Buffer.concat(parts); return Buffer.concat([u32(body.length+8),str(type),body]); }
function full(type, version, flags, ...parts){ return box(type,u8(version,(flags>>>16)&255,(flags>>>8)&255,flags&255),...parts); }

function splitAnnexB(data) {
  const starts=[];
  for(let i=0;i+3<data.length;i++) {
    if(data[i]===0&&data[i+1]===0&&data[i+2]===1){ starts.push([i,3]); i+=2; }
    else if(i+4<=data.length&&data[i]===0&&data[i+1]===0&&data[i+2]===0&&data[i+3]===1){ starts.push([i,4]); i+=3; }
  }
  if (!starts.length) return data.length ? [data] : [];
  return starts.map((s,n)=>data.subarray(s[0]+s[1], n+1<starts.length?starts[n+1][0]:data.length)).filter(n=>n.length);
}
function splitLengthPrefixed(data) {
  const nals=[];let offset=0;
  while(offset+4<=data.length){const size=data.readUInt32BE(offset);offset+=4;if(!size||offset+size>data.length)return [];nals.push(data.subarray(offset,offset+size));offset+=size;}
  return offset===data.length?nals:[];
}
function parseAvcDecoderConfig(data) {
  if(data.length<7||data[0]!==1)return [];
  const nals=[];let offset=5;const spsCount=data[offset++]&31;
  for(let i=0;i<spsCount;i++){if(offset+2>data.length)return [];const size=data.readUInt16BE(offset);offset+=2;if(offset+size>data.length)return [];nals.push(data.subarray(offset,offset+size));offset+=size;}
  if(offset>=data.length)return nals;const ppsCount=data[offset++];
  for(let i=0;i<ppsCount;i++){if(offset+2>data.length)return [];const size=data.readUInt16BE(offset);offset+=2;if(offset+size>data.length)return [];nals.push(data.subarray(offset,offset+size));offset+=size;}
  return nals;
}
function codecNals(data) {
  if(!data?.length)return [];
  const decoderConfig=parseAvcDecoderConfig(data);if(decoderConfig.length)return decoderConfig;
  const annexB=splitAnnexB(data);if(annexB.length>1||annexB.length===1&&annexB[0].length!==data.length)return annexB;
  const lengthPrefixed=splitLengthPrefixed(data);return lengthPrefixed.length?lengthPrefixed:annexB;
}
function avccPayload(data){ return Buffer.concat(codecNals(data).map(n=>Buffer.concat([u32(n.length),n]))); }
function makeConfig(sps,pps) {
  if(!sps||!pps||sps.length<4) return null;
  const avcC=Buffer.concat([u8(1,sps[1],sps[2],sps[3],0xff,0xe1),u16(sps.length),sps,u8(1),u16(pps.length),pps]);
  return {sps:Buffer.from(sps),pps:Buffer.from(pps),avcC};
}
function extractConfig(data) {const nals=codecNals(data);return makeConfig(nals.find(n=>(n[0]&31)===7),nals.find(n=>(n[0]&31)===8));}
class CodecConfigTracker {
  constructor(){this.sps=null;this.pps=null;}
  add(data){for(const nal of codecNals(data)){const type=nal[0]&31;if(type===7)this.sps=Buffer.from(nal);else if(type===8)this.pps=Buffer.from(nal);}return makeConfig(this.sps,this.pps);}
}

function initSegment(width,height,avcC,timescale=1000000) {
  const matrix=Buffer.concat([u32(0x00010000),u32(0),u32(0),u32(0),u32(0x00010000),u32(0),u32(0),u32(0),u32(0x40000000)]);
  const mvhd=full('mvhd',0,0,u32(0),u32(0),u32(timescale),u32(0),u32(0x00010000),u16(0x0100),u16(0),Buffer.alloc(8),matrix,Buffer.alloc(24),u32(2));
  const tkhd=full('tkhd',0,7,u32(0),u32(0),u32(1),u32(0),u32(0),Buffer.alloc(8),u16(0),u16(0),u16(0),u16(0),matrix,u32(width<<16),u32(height<<16));
  const mdhd=full('mdhd',0,0,u32(0),u32(0),u32(timescale),u32(0),u16(0x55c4),u16(0));
  const hdlr=full('hdlr',0,0,u32(0),str('vide'),Buffer.alloc(12),str('VideoHandler\0'));
  const avc1=box('avc1',Buffer.alloc(6),u16(1),Buffer.alloc(16),u16(width),u16(height),u32(0x00480000),u32(0x00480000),u32(0),u16(1),Buffer.alloc(32),u16(0x0018),u16(0xffff),box('avcC',avcC));
  const stbl=box('stbl',full('stsd',0,0,u32(1),avc1),full('stts',0,0,u32(0)),full('stsc',0,0,u32(0)),full('stsz',0,0,u32(0),u32(0)),full('stco',0,0,u32(0)));
  const dinf=box('dinf',full('dref',0,0,u32(1),full('url ',0,1)));
  const minf=box('minf',full('vmhd',0,1,u16(0),u16(0),u16(0),u16(0)),dinf,stbl);
  const trak=box('trak',tkhd,box('mdia',mdhd,hdlr,minf));
  const mvex=box('mvex',full('trex',0,0,u32(1),u32(1),u32(0),u32(0),u32(0x00010000)));
  return Buffer.concat([box('ftyp',str('iso6'),u32(1),str('iso6'),str('mp41'),str('avc1')),box('moov',mvhd,trak,mvex)]);
}

function fragment(gop, fragmentSequence) {
  const samples=gop.buffers.map((b,i)=>{
    const next=gop.buffers[i+1]; const duration=Number(next?next.ptsUs-b.ptsUs:(i?b.ptsUs-gop.buffers[i-1].ptsUs:33333n));
    const data=avccPayload(b.payload); return {duration:Math.max(1,duration),data,key:(b.flags&1)!==0};
  });
  const mdatData=Buffer.concat(samples.map(s=>s.data));
  const tfhd=full('tfhd',0,0x020000,u32(1));
  const tfdt=full('tfdt',1,0,u32(Number((gop.startPtsUs>>32n)&0xffffffffn)),u32(Number(gop.startPtsUs&0xffffffffn)));
  const rows=Buffer.concat(samples.map(s=>Buffer.concat([u32(s.duration),u32(s.data.length),u32(s.key?0x02000000:0x01010000),u32(0)])));
  let trun=full('trun',0,0x000f01,u32(samples.length),u32(0),rows);
  let moof=box('moof',full('mfhd',0,0,u32(fragmentSequence)),box('traf',tfhd,tfdt,trun));
  trun=full('trun',0,0x000f01,u32(samples.length),u32(moof.length+8),rows);
  moof=box('moof',full('mfhd',0,0,u32(fragmentSequence)),box('traf',tfhd,tfdt,trun));
  return Buffer.concat([moof,box('mdat',mdatData)]);
}

class FragmentedMp4Recorder {
  constructor(options) { Object.assign(this,options); this.fd=null; this.file=null; this.fileId=null; this.startedEpochUs=null; this.fragmentSequence=1; this.offset=0; }
  open(gop) {
    if(!this.codecConfig) throw new Error('codec configuration is unavailable');
    const d=new Date(Number(gop.startServerEpochUs/1000n));
    const dir=path.join(this.videoDir,d.toISOString().slice(0,10),`ring${String(this.hello.ring).padStart(2,'0')}`,`cam${this.hello.camera}`);
    fs.mkdirSync(dir,{recursive:true});
    const base=d.toISOString().slice(11,19).replace(/:/g,'-'); let file=path.join(dir,`${base}.mp4`), n=1;
    while(fs.existsSync(file)) file=path.join(dir,`${base}-${n++}.mp4`);
    this.fd=fs.openSync(file,'wx'); this.file=file; this.startedEpochUs=gop.startServerEpochUs;
    const init=initSegment(this.hello.width,this.hello.height,this.codecConfig.avcC); fs.writeSync(this.fd,init); this.offset=init.length;
    this.fileId=this.onOpen(file,gop,this.offset); this.fragmentSequence=1;
  }
  write(gop) {
    if(!this.fd || Number(gop.startServerEpochUs-this.startedEpochUs)/1e6>=this.fileSeconds) { this.close(gop); this.open(gop); }
    const data=fragment(gop,this.fragmentSequence++), offset=this.offset; fs.writeSync(this.fd,data); this.offset+=data.length;
    this.onFragment(this.fileId,gop,offset,data.length,this.offset); return {fileId:this.fileId,path:this.file,offset,length:data.length};
  }
  close(lastGop=null) { if(this.fd===null)return; try{fs.fsyncSync(this.fd);}finally{fs.closeSync(this.fd);this.fd=null;} this.onClose(this.fileId,lastGop,this.offset); this.file=null;this.fileId=null; }
}

module.exports={splitAnnexB,splitLengthPrefixed,parseAvcDecoderConfig,codecNals,extractConfig,CodecConfigTracker,initSegment,fragment,FragmentedMp4Recorder};
