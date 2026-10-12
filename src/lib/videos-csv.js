const { planDates } = require('./dates');
const { toCsv } = require('./csv');

// The video list as CSV text (shared by the download and the Google Sheets export).
function videosCsv(settings, videos) {
  const dates = (v) => planDates(settings, v.position);
  return toCsv(
    [
      { label: 'Week', value: (v) => v.position },
      { label: 'Series', value: (v) => v.series },
      { label: 'Title', value: (v) => v.title },
      { label: 'Amharic title', value: (v) => v.title_am },
      { label: 'Stage', value: (v) => v.stage },
      { label: 'Script day', value: (v) => dates(v).script },
      { label: 'Record day', value: (v) => dates(v).record },
      { label: 'Edit day', value: (v) => dates(v).edit },
      { label: 'Publish day', value: (v) => dates(v).publish },
      { label: 'Views after 7 days', value: (v) => v.views_7d },
      { label: 'Video link', value: (v) => v.video_url },
    ],
    videos,
  );
}

module.exports = { videosCsv };
