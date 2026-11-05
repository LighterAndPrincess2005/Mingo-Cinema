function movieArt(movie, wide = false, hero = false) {
  const media = movie.media;
  if (!media || media.provider !== 'NguonC' || media.title !== movie.title ||
      media.slug !== movie.slug || !media.id) return '';
  const value = wide ? media.backdropUrl : media.posterUrl;
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.hostname !== 'img.nguonc.com') return '';
  const dimensions = wide ? media.backdropSize : media.posterSize;
  if (!Array.isArray(dimensions) || dimensions.length !== 2) return '';
  const [width, height] = dimensions;
  if (wide ? width <= height : width >= height) return '';
  const escape = value => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
  return '<span class="movie-art' + (wide ? ' movie-art-wide' : '') + '">' +
    '<img alt="" data-movie-image width="' + width + '" height="' + height +
    '" src="' + escape(url.href) + '"' +
    (hero ? ' fetchpriority="high"' : ' loading="lazy"') + '>' +
    '<span class="image-credit">NguonC</span></span>';
}

document.addEventListener('load', event => {
  if (event.target.matches?.('img[data-movie-image]')) event.target.parentElement.classList.add('image-ready');
}, true);

document.addEventListener('error', event => {
  if (event.target.matches?.('img[data-movie-image]')) event.target.parentElement.classList.remove('image-ready');
}, true);
