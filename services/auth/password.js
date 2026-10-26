const {
  randomBytes,
  scrypt,
  timingSafeEqual
} = require("node:crypto");

const { promisify } = require("node:util");

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;

const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");

  const derived = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );

  return {
    passwordHash: derived.toString("hex"),
    passwordSalt: salt
  };
}

async function verifyPassword(password, hash, salt) {
  if (
    typeof hash !== "string" ||
    typeof salt !== "string" ||
    !/^[a-f0-9]{128}$/i.test(hash) ||
    !/^[a-f0-9]{32}$/i.test(salt)
  ) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");

  const actual = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );

  return timingSafeEqual(expected, actual);
}

module.exports = {
  hashPassword,
  verifyPassword
};