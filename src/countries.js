// ---------------------------------------------------------------------------
// Countries — name to ISO2, used for flags and for the add-trip dropdown.
// Aliases cover the spellings already in the imported data.
// ---------------------------------------------------------------------------

export const COUNTRY_CODES = {
  Albania: 'AL',
  Andorra: 'AD',
  Armenia: 'AM',
  Azerbaijan: 'AZ',
  Bahamas: 'BS',
  Barbados: 'BB',
  Belize: 'BZ',
  Bhutan: 'BT',
  Bosnia: 'BA',
  Botswana: 'BW',
  Bulgaria: 'BG',
  'Cape Verde': 'CV',
  'Costa Rica': 'CR',
  'Dominican Republic': 'DO',
  Ethiopia: 'ET',
  Fiji: 'FJ',
  Guatemala: 'GT',
  Honduras: 'HN',
  Jamaica: 'JM',
  Kazakhstan: 'KZ',
  Luxembourg: 'LU',
  Madagascar: 'MG',
  Maldives: 'MV',
  Mauritius: 'MU',
  Moldova: 'MD',
  Mongolia: 'MN',
  Mozambique: 'MZ',
  Namibia: 'NA',
  Nicaragua: 'NI',
  Nigeria: 'NG',
  Panama: 'PA',
  Paraguay: 'PY',
  Qatar: 'QA',
  Rwanda: 'RW',
  'Saudi Arabia': 'SA',
  Senegal: 'SN',
  Serbia: 'RS',
  Seychelles: 'SC',
  Uganda: 'UG',
  Ukraine: 'UA',
  Uzbekistan: 'UZ',
  Venezuela: 'VE',
  Zambia: 'ZM',
  Zimbabwe: 'ZW',
  Argentina: 'AR',
  Australia: 'AU',
  Austria: 'AT',
  Belgium: 'BE',
  Bolivia: 'BO',
  Brazil: 'BR',
  Cambodia: 'KH',
  Canada: 'CA',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  Croatia: 'HR',
  Cuba: 'CU',
  Cyprus: 'CY',
  'Czech Republic': 'CZ',
  Denmark: 'DK',
  Ecuador: 'EC',
  Egypt: 'EG',
  Estonia: 'EE',
  Finland: 'FI',
  France: 'FR',
  Georgia: 'GE',
  Germany: 'DE',
  Greece: 'GR',
  Hungary: 'HU',
  Iceland: 'IS',
  India: 'IN',
  Indonesia: 'ID',
  Ireland: 'IE',
  Israel: 'IL',
  Italy: 'IT',
  Japan: 'JP',
  Jordan: 'JO',
  Kenya: 'KE',
  Laos: 'LA',
  Latvia: 'LV',
  Lithuania: 'LT',
  Malaysia: 'MY',
  Malta: 'MT',
  Mexico: 'MX',
  Montenegro: 'ME',
  Morocco: 'MA',
  Nepal: 'NP',
  Netherlands: 'NL',
  'New Zealand': 'NZ',
  Norway: 'NO',
  Oman: 'OM',
  Peru: 'PE',
  Philippines: 'PH',
  Poland: 'PL',
  Portugal: 'PT',
  Romania: 'RO',
  Singapore: 'SG',
  Slovakia: 'SK',
  Slovenia: 'SI',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  Spain: 'ES',
  'Sri Lanka': 'LK',
  Sweden: 'SE',
  Switzerland: 'CH',
  Taiwan: 'TW',
  Tanzania: 'TZ',
  Thailand: 'TH',
  Tunisia: 'TN',
  Turkey: 'TR',
  UAE: 'AE',
  Uruguay: 'UY',
  USA: 'US',
  Vietnam: 'VN',
};

// England, Scotland and Wales have their own emoji built from subdivision tags
const SUBDIVISION_FLAGS = {
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
};

// flagcdn serves the home nations under these codes
const SUBDIVISION_CODES = {
  Scotland: 'gb-sct',
  England: 'gb-eng',
  Wales: 'gb-wls',
  'United Kingdom': 'gb',
  UK: 'gb',
};

const ALIASES = {
  UK: 'United Kingdom',
  'United States': 'USA',
  US: 'USA',
  America: 'USA',
  Korea: 'South Korea',
  Czechia: 'Czech Republic',
  Holland: 'Netherlands',
  'New Zeland': 'New Zealand',
};

export function countryCode(name) {
  const clean = (name || '').trim();
  if (!clean) return null;
  if (SUBDIVISION_CODES[clean]) return SUBDIVISION_CODES[clean];
  const resolved = ALIASES[clean] || clean;
  return COUNTRY_CODES[resolved] || null;
}

export function countryFlag(name) {
  const clean = (name || '').trim();
  if (!clean) return '';
  if (SUBDIVISION_FLAGS[clean]) return SUBDIVISION_FLAGS[clean];
  const resolved = ALIASES[clean] || clean;
  const code = COUNTRY_CODES[resolved];
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Names offered in the add-trip country dropdown, plus the subdivisions. */
export const COUNTRY_NAMES = [
  ...Object.keys(COUNTRY_CODES),
  ...Object.keys(SUBDIVISION_FLAGS),
].sort();
