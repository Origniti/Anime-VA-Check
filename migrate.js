import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.run(`ALTER TABLE watched_anime ADD COLUMN coverImage TEXT`, (err) => {
    if (err) {
      console.log("Error:", err.message);
    } else {
      console.log("Column 'coverImage' added successfully!");
    }
    db.close();
  });
});
