import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../../migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(file,dir),'utf8'));
 sql.exec(`INSERT INTO users VALUES(3,'owner','Owner','unused','writer',1),(4,'other','Other','unused','writer',1);
 INSERT INTO novels(id,author_id,title,created_at,updated_at) VALUES(11,3,'Owned novel',1,1),(12,4,'Other novel',1,1);
 INSERT INTO chapters(id,novel_id,title,body,position,created_at) VALUES(7,11,'Chapter 1','Original',1,1),(8,12,'Private','Other manuscript',1,1);`);
 const db={sql,prepare(query){return {bind(...args){return {
  async first(){return sql.prepare(query).get(...args)||null;},
  async all(){return {results:sql.prepare(query).all(...args)};},
  async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
 };}};},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return db;
}
