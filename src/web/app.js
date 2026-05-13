const PROGRAMS = [
  { id: 'zwtx', name: '朝闻天下' },
  { id: 'xwlb', name: '新闻联播' },
];

const params = new URLSearchParams(location.search);
const currentProgramId = params.get('program') || 'zwtx';

function buildIndexUrl(programId) {
  return `./data/${programId}/index.json`;
}

function renderProgramTabs() {
  const nav = document.querySelector('#program-tabs');
  if (!nav) return;
  nav.replaceChildren(
    ...PROGRAMS.map((program) => {
      const btn = document.createElement('a');
      btn.className = `program-tab${program.id === currentProgramId ? ' active' : ''}`;
      btn.href = `?program=${encodeURIComponent(program.id)}`;
      btn.textContent = program.name;
      return btn;
    }),
  );
}

async function loadEpisodes() {
  renderProgramTabs();

  const list = document.querySelector('#episode-list');
  list.textContent = '加载中...';

  const response = await fetch(buildIndexUrl(currentProgramId), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`无法读取 ${buildIndexUrl(currentProgramId)}`);
  }

  const episodes = await response.json();
  if (!episodes.length) {
    list.textContent = '暂无可播放节目。';
    return;
  }

  list.replaceChildren(
    ...episodes.map((episode, index) => {
      const link = document.createElement('a');
      link.className = 'episode-row';
      link.href = `./episode.html?program=${encodeURIComponent(currentProgramId)}&date=${encodeURIComponent(episode.date)}`;
      link.innerHTML = `
        <span>
          <strong>${escapeHtml(episode.date)}</strong>
          <small>${escapeHtml(episode.title)}</small>
        </span>
        <b>${index === 0 ? '最新' : episode.type.toUpperCase()}</b>
      `;
      return link;
    }),
  );
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

loadEpisodes().catch((error) => {
  document.querySelector('#episode-list').textContent = error.message;
});
