// Zero-dependency OOXML/ZIP writer for private manuscript Word exports.
// No OpenAI requests, third-party services, or document text transformation.
const encoder = new TextEncoder();
function xml(value) {
 return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function paragraph(value,style) {
 // Word paragraphs represent source newline boundaries, including blank lines.
 // All text inside one manuscript line stays in ONE w:t preserving original spaces.
 const run='<w:r><w:rPr><w:rFonts w:ascii="Noto Serif Thai" w:hAnsi="Noto Serif Thai" w:eastAsia="Noto Serif Thai" w:cs="TH Sarabun New"/><w:lang w:val="th-TH" w:eastAsia="th-TH" w:bidi="th-TH"/></w:rPr><w:t xml:space="preserve">'+xml(value)+'</w:t></w:r>';
 return '<w:p>'+(style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':'')+run+'</w:p>';
}
function crc32(data){
 let c=0xFFFFFFFF;
 for(let i=0;i<data.length;i++){c^=data[i];for(let j=0;j<8;j++)c=c&1?(c>>>1)^0xEDB88320:c>>>1;}
 return (c^0xFFFFFFFF)>>>0;
}
function wordZip(entries){
 const records=[],central=[];let offset=0;
 function u16(view,at,v){view.setUint16(at,v,true);}
 function u32(view,at,v){view.setUint32(at,v>>>0,true);}
 for(const [filename,content] of entries){
  const name=encoder.encode(filename),data=encoder.encode(content),checksum=crc32(data);
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
  u32(h,0,0x04034b50);u16(h,4,20);u16(h,6,0x0800);u16(h,8,0);u32(h,14,checksum);
  u32(h,18,data.length);u32(h,22,data.length);u16(h,26,name.length);header.set(name,30);
  records.push(header,data);
  const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);
  u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x0800);u16(d,10,0);
  u32(d,16,checksum);u32(d,20,data.length);u32(d,24,data.length);u16(d,28,name.length);
  u32(d,42,offset);directory.set(name,46);central.push(directory);offset+=header.length+data.length;
 }
 const centerSize=central.reduce((n,b)=>n+b.length,0);
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 u32(e,0,0x06054b50);u16(e,8,entries.length);u16(e,10,entries.length);
 u32(e,12,centerSize);u32(e,16,offset);
 return new Blob([...records,...central,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export function makeDocx(title,chapters){
 const content=[
  paragraph(title,'Title'),
  ...chapters.flatMap(c=>[
   paragraph(String(c.position)+'. '+c.title,'Heading1'),
   ...c.body.split(/\r\n|\r|\n/).map(line=>paragraph(line))
  ])
 ].join('');
 const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
 content+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'+
 '<w:pgMar w:top="1247" w:right="1020" w:bottom="1190" w:left="1020" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
 '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="390" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Noto Serif Thai" w:hAnsi="Noto Serif Thai" w:eastAsia="Noto Serif Thai" w:cs="TH Sarabun New"/><w:sz w:val="28"/><w:lang w:val="th-TH"/></w:rPr></w:style>'+
 '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="260"/></w:pPr><w:rPr><w:b/><w:sz w:val="42"/></w:rPr></w:style>'+
 '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="300" w:after="220"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style></w:styles>';
 return wordZip([
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?>'+
   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
   '<Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['word/document.xml',document],['word/styles.xml',styles]
 ]);
}
export function makePlainText(title,chapters){
 return title+'\n\n'+chapters.map(c=>String(c.position)+'. '+c.title+'\n'+c.body).join('\n\n');
}
