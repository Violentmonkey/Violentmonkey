import { getDomain as getDomain_, getPublicSuffix as getPublicSuffix_ } from 'tldts';

/**
 * tldts does not respect the public suffix list by default, but can be opt in manually
 * with the option `allowPrivateDomains`. Hoist the `sharedOpts` can also help avoid
 * re-creating the object every time.
 *
 * Note `extractHostname` and `validateHostname` are set to false because the inputs are
 * from `new URL(url).hostname` and are known to be valid
 */
const getDomainSharedOpts = {
  allowPrivateDomains: true,
  extractHostname: false, // inputs are already hostnames
  validateHostname: false, // inputs are already valid, no need to perform extra validation
};

const getPublicSuffixSharedOpts = {
  allowPrivateDomains: true
};

export const getDomain = url => getDomain_(url, getDomainSharedOpts);
export const getPublicSuffix = url => getPublicSuffix_(url, getPublicSuffixSharedOpts);
