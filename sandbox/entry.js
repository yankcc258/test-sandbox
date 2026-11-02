import { legacyDestination } from './routing.js';
const target = legacyDestination(location.search);
if (target) {
  document.documentElement.style.visibility = 'hidden';
  const destination = new URL(target, location.href);
  destination.search = location.search;
  destination.hash = location.hash;
  location.replace(destination.href);
}
