// Origin: portfolio app/layout.tsx SITE_URL; hostnames: nix/hosts/*/default.nix.
// Unknown machines stay disabled; no automatic registration.
export const fleetEndpoint = 'https://lucashanson.dk/api/admin/fleet/report';
export function fleetDefaults(hostname) {
  const host = hostname.toLowerCase().replace(/\.local$/, '');
  const hostId = ({ gimle: 'gimle', 'lucas-macbook-pro': 'macbook' })[host];
  return hostId ? { endpoint: fleetEndpoint, hostId } : undefined;
}
