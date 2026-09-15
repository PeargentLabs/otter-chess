// Best-effort team-name -> flag-emoji lookup. Lichess broadcast PGN headers
// carry a federation's plain English name (e.g. "United States", "Norway"),
// not an ISO code, so this maps the common names for Olympiad-participating
// federations to an ISO 3166-1 alpha-2 code and renders the flag from that.
// Missing/unrecognized names just render with no flag — this is cosmetic,
// never load-bearing.

const NAME_TO_ALPHA2: Record<string, string> = {
  'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Andorra': 'AD', 'Angola': 'AO',
  'Argentina': 'AR', 'Armenia': 'AM', 'Australia': 'AU', 'Austria': 'AT', 'Azerbaijan': 'AZ',
  'Bahrain': 'BH', 'Bangladesh': 'BD', 'Belarus': 'BY', 'Belgium': 'BE', 'Bolivia': 'BO',
  'Bosnia and Herzegovina': 'BA', 'Botswana': 'BW', 'Brazil': 'BR', 'Bulgaria': 'BG',
  'Burkina Faso': 'BF', 'Cambodia': 'KH', 'Cameroon': 'CM', 'Canada': 'CA', 'Chile': 'CL',
  'China': 'CN', 'Colombia': 'CO', 'Costa Rica': 'CR', 'Croatia': 'HR', 'Cuba': 'CU',
  'Cyprus': 'CY', 'Czech Republic': 'CZ', 'Denmark': 'DK', 'Dominican Republic': 'DO',
  'Ecuador': 'EC', 'Egypt': 'EG', 'El Salvador': 'SV', 'England': 'GB', 'Estonia': 'EE',
  'Ethiopia': 'ET', 'Fiji': 'FJ', 'Finland': 'FI', 'France': 'FR', 'Georgia': 'GE',
  'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR', 'Guatemala': 'GT', 'Honduras': 'HN',
  'Hong Kong': 'HK', 'Hungary': 'HU', 'Iceland': 'IS', 'India': 'IN', 'Indonesia': 'ID',
  'Iran': 'IR', 'Iraq': 'IQ', 'Ireland': 'IE', 'Israel': 'IL', 'Italy': 'IT',
  'Ivory Coast': 'CI', 'Jamaica': 'JM', 'Japan': 'JP', 'Jordan': 'JO', 'Kazakhstan': 'KZ',
  'Kenya': 'KE', 'Kosovo': 'XK', 'Kuwait': 'KW', 'Kyrgyzstan': 'KG', 'Laos': 'LA',
  'Latvia': 'LV', 'Lebanon': 'LB', 'Libya': 'LY', 'Liechtenstein': 'LI', 'Lithuania': 'LT',
  'Luxembourg': 'LU', 'Macedonia': 'MK', 'North Macedonia': 'MK', 'Madagascar': 'MG',
  'Malaysia': 'MY', 'Maldives': 'MV', 'Mali': 'ML', 'Malta': 'MT', 'Mauritius': 'MU',
  'Mexico': 'MX', 'Moldova': 'MD', 'Monaco': 'MC', 'Mongolia': 'MN', 'Montenegro': 'ME',
  'Morocco': 'MA', 'Myanmar': 'MM', 'Namibia': 'NA', 'Nepal': 'NP', 'Netherlands': 'NL',
  'New Zealand': 'NZ', 'Nicaragua': 'NI', 'Nigeria': 'NG', 'Norway': 'NO', 'Oman': 'OM',
  'Pakistan': 'PK', 'Palestine': 'PS', 'Panama': 'PA', 'Paraguay': 'PY', 'Peru': 'PE',
  'Philippines': 'PH', 'Poland': 'PL', 'Portugal': 'PT', 'Puerto Rico': 'PR', 'Qatar': 'QA',
  'Romania': 'RO', 'Rwanda': 'RW', 'Samoa': 'WS', 'Saudi Arabia': 'SA', 'Scotland': 'GB',
  'Senegal': 'SN', 'Serbia': 'RS', 'Seychelles': 'SC', 'Singapore': 'SG', 'Slovakia': 'SK',
  'Slovenia': 'SI', 'South Africa': 'ZA', 'South Korea': 'KR', 'Spain': 'ES',
  'Sri Lanka': 'LK', 'Sudan': 'SD', 'Suriname': 'SR', 'Sweden': 'SE', 'Switzerland': 'CH',
  'Syria': 'SY', 'Taiwan': 'TW', 'Tajikistan': 'TJ', 'Tanzania': 'TZ', 'Thailand': 'TH',
  'Togo': 'TG', 'Trinidad and Tobago': 'TT', 'Tunisia': 'TN', 'Turkey': 'TR',
  'Turkmenistan': 'TM', 'Uganda': 'UG', 'Ukraine': 'UA', 'United Arab Emirates': 'AE',
  'United States': 'US', 'Uruguay': 'UY', 'Uzbekistan': 'UZ', 'Venezuela': 'VE',
  'Vietnam': 'VN', 'Wales': 'GB', 'Yemen': 'YE', 'Zambia': 'ZM', 'Zimbabwe': 'ZW',
  'FIDE': 'UN',
};

// Flag *emoji* render as plain two-letter codes on a lot of Windows/browser
// combinations (no color-flag glyphs in the default font), so this renders
// an actual small flag image (flagcdn.com — free, no key, widely used)
// instead of relying on emoji support.
export function teamFlagUrl(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  const code = NAME_TO_ALPHA2[teamName.trim()];
  if (!code || code === 'UN') return null;
  return `https://flagcdn.com/24x18/${code.toLowerCase()}.png`;
}
