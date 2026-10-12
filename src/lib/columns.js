// The video list asks for the doc_url column, which only exists after the Google part of db/schema.sql has been run.
// If the database has not been updated yet, leave that column out so the app still loads.
const BASE = 'id,position,series,title,title_am,key_points,stage,checklist,views_7d,video_url,notes,published_at,updated_at';
let withDoc = true;
module.exports = {
  videoColumns: () => (withDoc ? BASE + ',doc_url' : BASE),
  setDocColumn: (ok) => { withDoc = ok; },
  isMissingColumn: (e) => Boolean(e && (e.code === '42703' || e.code === 'PGRST204')),
};
