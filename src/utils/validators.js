function isEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isInt(value, min, max) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= min && num <= max;
}

function validateImapTest(body) {
  const errors = [];

  if (!body.user || !isEmail(body.user)) {
    errors.push({ field: 'user', message: 'Valid email is required' });
  }

  if (!body.password || typeof body.password !== 'string' || body.password.trim() === '') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (!body.host || typeof body.host !== 'string') {
    errors.push({ field: 'host', message: 'Host is required' });
  }

  if (body.port && !isInt(body.port, 1, 65535)) {
    errors.push({ field: 'port', message: 'Port must be between 1 and 65535' });
  }

  return errors;
}

function validateImapFetch(body) {
  const errors = validateImapTest(body);

  if (body.limit && !isInt(body.limit, 1, 100)) {
    errors.push({ field: 'limit', message: 'Limit must be between 1 and 100' });
  }

  if (body.folder && typeof body.folder !== 'string') {
    errors.push({ field: 'folder', message: 'Folder must be a string' });
  }

  return errors;
}

function isValidIP(host) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (!ipv4Regex.test(host) && !ipv6Regex.test(host)) return false;
  if (ipv4Regex.test(host)) {
    const parts = host.split('.').map(Number);
    return parts.every(p => p >= 0 && p <= 255);
  }
  return true;
}

function isValidHostname(host) {
  const hostnameRegex = /^([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
  return hostnameRegex.test(host);
}

module.exports = { validateImapTest, validateImapFetch };