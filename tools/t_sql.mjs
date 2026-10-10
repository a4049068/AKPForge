/* SQLite subset unit test through the real shim surface. */
import { installDom } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
host.packageNameOverride = 'test';
Object.defineProperty(host, 'packageName', { get: () => 'test.db.app' });
const { Runtime } = await import('../js/runtime.js');
const R = new Runtime({ log: () => {}, onUnresolved: (k, key) => console.log('  unresolved', k, key) });
host.R = R;
const { installFramework } = await import('../js/framework.js');
const { installWidgets } = await import('../js/ui.js');
const { installSqlite } = await import('../js/sqlite.js');
installFramework(R, host); installWidgets(R, host); installSqlite(R, host);
const db = R.is('Landroid/database/sqlite/SQLiteDatabase;->openOrCreateDatabase(Ljava/lang/String;Landroid/database/sqlite/SQLiteDatabase$CursorFactory;)Landroid/database/sqlite/SQLiteDatabase;', 'notes', null);
R.iv('Landroid/database/sqlite/SQLiteDatabase;->execSQL(Ljava/lang/String;)V', db, 'CREATE TABLE notes (_id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, done INTEGER, score REAL)');
const cv = R.ni('Landroid/content/ContentValues;'); cv.$m = new Map();
cv.$m.set('title', 'hello world'); cv.$m.set('done', 0); cv.$m.set('score', 4.5);
const id1 = R.iv('Landroid/database/sqlite/SQLiteDatabase;->insert(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)J', db, 'notes', null, cv);
const cv2 = R.ni('Landroid/content/ContentValues;'); cv2.$m = new Map([['title', 'second'], ['done', 1], ['score', 2.0]]);
const id2 = R.iv('Landroid/database/sqlite/SQLiteDatabase;->insert(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)J', db, 'notes', null, cv2);
console.log('inserted ids', id1, id2);
const cur = R.iv('Landroid/database/sqlite/SQLiteDatabase;->rawQuery(Ljava/lang/String;[Ljava/lang/String;)Landroid/database/Cursor;', db, 'SELECT _id, title, done FROM notes WHERE done = ? ORDER BY _id DESC LIMIT 5', ['0']);
let n = 0;
while (R.iv('Landroid/database/Cursor;->moveToNext()Z', cur)) {
  n++;
  console.log(' row', R.iv('Landroid/database/Cursor;->getInt(I)I', cur, 0), JSON.stringify(R.iv('Landroid/database/Cursor;->getString(I)Ljava/lang/String;', cur, 1)), 'done=', R.iv('Landroid/database/Cursor;->getInt(I)I', cur, 2));
}
console.log('rows matched:', n, '(expect 1)');
const upd = R.iv('Landroid/database/sqlite/SQLiteDatabase;->update(Ljava/lang/String;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I', db, 'notes', cv2, 'title = ?', ['hello world']);
console.log('updated:', upd, '(expect 1)');
const cnt = R.iv('Landroid/database/sqlite/SQLiteDatabase;->rawQuery(Ljava/lang/String;[Ljava/lang/String;)Landroid/database/Cursor;', db, 'SELECT COUNT(*) FROM notes', []);
console.log('count cursor cols:', R.iv('Landroid/database/Cursor;->getColumnCount()I', cnt));
const del = R.iv('Landroid/database/sqlite/SQLiteDatabase;->delete(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;)I', db, 'notes', 'done = ?', ['1']);
console.log('deleted:', del, '(expect 1)  vfs:', [...host.vfs.keys()]);
