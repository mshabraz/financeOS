/**
 * Local network addresses for LAN access instructions and discovery UI.
 */

const os = require('os');

const VIRTUAL_NIC_RE = /virtual|vmware|hyper-v|vethernet|loopback|tunnel|docker|wsl|bluetooth/i;

function isPrivateIPv4(ip) {
  if (!ip || ip.includes(':')) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  return false;
}

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.internal) continue;
      if (iface.family !== 'IPv4' && iface.family !== 4) continue;
      if (!isPrivateIPv4(iface.address)) continue;
      addresses.push({
        name,
        address: iface.address,
        netmask: iface.netmask,
      });
    }
  }

  return addresses;
}

function getPreferredLanAddresses() {
  const all = getNetworkAddresses();
  const physical = all.filter((a) => !VIRTUAL_NIC_RE.test(a.name));
  return physical.length > 0 ? physical : all;
}

function getPrimaryLanIp() {
  const addrs = getPreferredLanAddresses();
  const wifi = addrs.find((a) => /wi-?fi|wlan|wireless/i.test(a.name));
  if (wifi) return wifi.address;
  const eth = addrs.find((a) => /ethernet|eth/i.test(a.name));
  if (eth) return eth.address;
  return addrs[0]?.address || null;
}

function getLanUrls({ port, https, hostname }) {
  const scheme = https ? 'https' : 'http';
  const host = hostname || os.hostname();
  const urls = [
    { label: 'This PC (localhost)', url: `${scheme}://localhost:${port}` },
    { label: `Hostname (${host})`, url: `${scheme}://${host}:${port}` },
  ];

  for (const { address, name } of getPreferredLanAddresses()) {
    urls.push({
      label: `${name} — ${address}`,
      url: `${scheme}://${address}:${port}`,
    });
  }

  return urls;
}

module.exports = {
  getNetworkAddresses,
  getPreferredLanAddresses,
  getPrimaryLanIp,
  getLanUrls,
  isPrivateIPv4,
  hostname: () => os.hostname(),
};
