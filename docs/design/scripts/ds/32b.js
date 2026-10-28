const newA = figma.createImage(b64ToBytes(PHOTOS.a)).hash, newB = figma.createImage(b64ToBytes(PHOTOS.b)).hash, oldA = figma.createImage(b64ToBytes(PHOTOS_OLD.a)).hash, oldB = figma.createImage(b64ToBytes(PHOTOS_OLD.b)).hash;
let nA=0,nB=0,oA=0,oB=0;
for (const n of S2().findAll(n=>'fills' in n && Array.isArray(n.fills))) for (const f of n.fills) if (f.type==='IMAGE') { if (f.imageHash===newA) nA++; if (f.imageHash===newB) nB++; if (f.imageHash===oldA) oA++; if (f.imageHash===oldB) oB++; }
return {nA,nB,oA,oB};
