// Catálogo de países para el selector de prefijo telefónico (Código E.164).
// Formato: [código ISO 3166-1 alfa-2, nombre, código de país E.164 sin '+'].
export interface Pais {
  iso2: string
  nombre: string
  codigo: string
  bandera: string
}

export const PAISES_RAW: [string, string, string][] = [
  ['AF', 'Afganistán', '93'], ['AL', 'Albania', '355'], ['DE', 'Alemania', '49'],
  ['AD', 'Andorra', '376'], ['AO', 'Angola', '244'], ['AI', 'Anguila', '1264'],
  ['AG', 'Antigua y Barbuda', '1268'], ['SA', 'Arabia Saudita', '966'], ['DZ', 'Argelia', '213'],
  ['AR', 'Argentina', '54'], ['AM', 'Armenia', '374'], ['AW', 'Aruba', '297'],
  ['AU', 'Australia', '61'], ['AT', 'Austria', '43'], ['AZ', 'Azerbaiyán', '994'],
  ['BS', 'Bahamas', '1242'], ['BH', 'Baréin', '973'], ['BD', 'Bangladés', '880'],
  ['BB', 'Barbados', '1246'], ['BE', 'Bélgica', '32'], ['BZ', 'Belice', '501'],
  ['BJ', 'Benín', '229'], ['BM', 'Bermudas', '1441'], ['BY', 'Bielorrusia', '375'],
  ['BO', 'Bolivia', '591'], ['BQ', 'Bonaire', '5997'], ['BA', 'Bosnia y Herzegovina', '387'],
  ['BW', 'Botsuana', '267'], ['BR', 'Brasil', '55'], ['BN', 'Brunéi', '673'],
  ['BG', 'Bulgaria', '359'], ['BF', 'Burkina Faso', '226'], ['BI', 'Burundi', '257'],
  ['BT', 'Bután', '975'], ['CV', 'Cabo Verde', '238'], ['KH', 'Camboya', '855'],
  ['CM', 'Camerún', '237'], ['CA', 'Canadá', '1'], ['QA', 'Catar', '974'],
  ['TD', 'Chad', '235'], ['CL', 'Chile', '56'], ['CN', 'China', '86'],
  ['CY', 'Chipre', '357'], ['CO', 'Colombia', '57'], ['KM', 'Comoras', '269'],
  ['CG', 'Congo', '242'], ['KP', 'Corea del Norte', '850'], ['KR', 'Corea del Sur', '82'],
  ['CI', 'Costa de Marfil', '225'], ['CR', 'Costa Rica', '506'], ['HR', 'Croacia', '385'],
  ['CU', 'Cuba', '53'], ['CW', 'Curazao', '5999'], ['DK', 'Dinamarca', '45'],
  ['DM', 'Dominica', '1767'], ['EC', 'Ecuador', '593'], ['EG', 'Egipto', '20'],
  ['SV', 'El Salvador', '503'], ['AE', 'Emiratos Árabes Unidos', '971'], ['ER', 'Eritrea', '291'],
  ['SK', 'Eslovaquia', '421'], ['SI', 'Eslovenia', '386'], ['ES', 'España', '34'],
  ['US', 'Estados Unidos', '1'], ['EE', 'Estonia', '372'], ['ET', 'Etiopía', '251'],
  ['PH', 'Filipinas', '63'], ['FI', 'Finlandia', '358'], ['FJ', 'Fiyi', '679'],
  ['FR', 'Francia', '33'], ['GA', 'Gabón', '241'], ['GM', 'Gambia', '220'],
  ['GE', 'Georgia', '995'], ['GH', 'Ghana', '233'], ['GI', 'Gibraltar', '350'],
  ['GD', 'Granada', '1473'], ['GR', 'Grecia', '30'], ['GL', 'Groenlandia', '299'],
  ['GP', 'Guadalupe', '590'], ['GU', 'Guam', '1671'], ['GT', 'Guatemala', '502'],
  ['GF', 'Guayana Francesa', '594'], ['GG', 'Guernsey', '44'], ['GN', 'Guinea', '224'],
  ['GW', 'Guinea-Bisáu', '245'], ['GQ', 'Guinea Ecuatorial', '240'], ['GY', 'Guyana', '592'],
  ['HT', 'Haití', '509'], ['HN', 'Honduras', '504'], ['HK', 'Hong Kong', '852'],
  ['HU', 'Hungría', '36'], ['IN', 'India', '91'], ['ID', 'Indonesia', '62'],
  ['IQ', 'Irak', '964'], ['IR', 'Irán', '98'], ['IE', 'Irlanda', '353'],
  ['IM', 'Isla de Man', '44'], ['IS', 'Islandia', '354'], ['KY', 'Islas Caimán', '1345'],
  ['CK', 'Islas Cook', '682'], ['FO', 'Islas Feroe', '298'], ['FK', 'Islas Malvinas', '500'],
  ['MH', 'Islas Marshall', '692'], ['SB', 'Islas Salomón', '677'], ['VG', 'Islas Vírgenes Británicas', '1284'],
  ['VI', 'Islas Vírgenes de EE. UU.', '1340'], ['IL', 'Israel', '972'], ['IT', 'Italia', '39'],
  ['JM', 'Jamaica', '1876'], ['JP', 'Japón', '81'], ['JE', 'Jersey', '44'],
  ['JO', 'Jordania', '962'], ['KZ', 'Kazajistán', '7'], ['KE', 'Kenia', '254'],
  ['KG', 'Kirguistán', '996'], ['KI', 'Kiribati', '686'], ['XK', 'Kosovo', '383'],
  ['KW', 'Kuwait', '965'], ['LA', 'Laos', '856'], ['LS', 'Lesoto', '266'],
  ['LV', 'Letonia', '371'], ['LB', 'Líbano', '961'], ['LR', 'Liberia', '231'],
  ['LY', 'Libia', '218'], ['LI', 'Liechtenstein', '423'], ['LT', 'Lituania', '370'],
  ['LU', 'Luxemburgo', '352'], ['MO', 'Macao', '853'], ['MK', 'Macedonia del Norte', '389'],
  ['MG', 'Madagascar', '261'], ['MY', 'Malasia', '60'], ['MW', 'Malaui', '265'],
  ['MV', 'Maldivas', '960'], ['ML', 'Malí', '223'], ['MT', 'Malta', '356'],
  ['MA', 'Marruecos', '212'], ['MQ', 'Martinica', '596'], ['MU', 'Mauricio', '230'],
  ['MR', 'Mauritania', '222'], ['MX', 'México', '52'], ['FM', 'Micronesia', '691'],
  ['MD', 'Moldavia', '373'], ['MC', 'Mónaco', '377'], ['MN', 'Mongolia', '976'],
  ['ME', 'Montenegro', '382'], ['MS', 'Montserrat', '1664'], ['MZ', 'Mozambique', '258'],
  ['MM', 'Myanmar (Birmania)', '95'], ['NA', 'Namibia', '264'], ['NR', 'Nauru', '674'],
  ['NP', 'Nepal', '977'], ['NI', 'Nicaragua', '505'], ['NE', 'Níger', '227'],
  ['NG', 'Nigeria', '234'], ['NU', 'Niue', '683'], ['NO', 'Noruega', '47'],
  ['NC', 'Nueva Caledonia', '687'], ['NZ', 'Nueva Zelanda', '64'], ['OM', 'Omán', '968'],
  ['NL', 'Países Bajos', '31'], ['PK', 'Pakistán', '92'], ['PW', 'Palaos', '680'],
  ['PS', 'Palestina', '970'], ['PA', 'Panamá', '507'], ['PG', 'Papúa Nueva Guinea', '675'],
  ['PY', 'Paraguay', '595'], ['PE', 'Perú', '51'], ['PL', 'Polonia', '48'],
  ['PT', 'Portugal', '351'], ['PR', 'Puerto Rico', '1787'], ['GB', 'Reino Unido', '44'],
  ['CF', 'República Centroafricana', '236'], ['CZ', 'República Checa', '420'],
  ['CD', 'República Democrática del Congo', '243'], ['DO', 'República Dominicana', '1809'],
  ['RW', 'Ruanda', '250'], ['RO', 'Rumanía', '40'], ['RU', 'Rusia', '7'],
  ['EH', 'Sáhara Occidental', '212'], ['WS', 'Samoa', '685'], ['AS', 'Samoa Americana', '1684'],
  ['KN', 'San Cristóbal y Nieves', '1869'], ['SM', 'San Marino', '378'], ['SX', 'San Martín (Países Bajos)', '1721'],
  ['MF', 'San Martín (Francia)', '590'], ['PM', 'San Pedro y Miquelón', '508'], ['VC', 'San Vicente y las Granadinas', '1784'],
  ['LC', 'Santa Lucía', '1758'], ['ST', 'Santo Tomé y Príncipe', '239'], ['SN', 'Senegal', '221'],
  ['RS', 'Serbia', '381'], ['SC', 'Seychelles', '248'], ['SL', 'Sierra Leona', '232'],
  ['SG', 'Singapur', '65'], ['SY', 'Siria', '963'], ['SO', 'Somalia', '252'],
  ['LK', 'Sri Lanka', '94'], ['SZ', 'Suazilandia', '268'], ['ZA', 'Sudáfrica', '27'],
  ['SD', 'Sudán', '249'], ['SS', 'Sudán del Sur', '211'], ['SE', 'Suecia', '46'],
  ['CH', 'Suiza', '41'], ['SR', 'Surinam', '597'], ['TH', 'Tailandia', '66'],
  ['TW', 'Taiwán', '886'], ['TZ', 'Tanzania', '255'], ['TJ', 'Tayikistán', '992'],
  ['TL', 'Timor Oriental', '670'], ['TG', 'Togo', '228'], ['TK', 'Tokelau', '690'],
  ['TO', 'Tonga', '676'], ['TT', 'Trinidad y Tobago', '1868'], ['TN', 'Túnez', '216'],
  ['TM', 'Turkmenistán', '993'], ['TC', 'Turcas y Caicos', '1649'], ['TR', 'Turquía', '90'],
  ['TV', 'Tuvalu', '688'], ['UA', 'Ucrania', '380'], ['UG', 'Uganda', '256'],
  ['UY', 'Uruguay', '598'], ['UZ', 'Uzbekistán', '998'], ['VU', 'Vanuatu', '678'],
  ['VA', 'Vaticano', '39'], ['VE', 'Venezuela', '58'], ['VN', 'Vietnam', '84'],
  ['YE', 'Yemen', '967'], ['DJ', 'Yibuti', '253'], ['ZM', 'Zambia', '260'],
  ['ZW', 'Zimbabue', '263'],
]

const banderaDe = (iso2: string): string => {
  const cp = [...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...cp)
}

export const PAISES: Pais[] = PAISES_RAW.map(([iso2, nombre, codigo]) => ({
  iso2,
  nombre,
  codigo,
  bandera: banderaDe(iso2),
}))

export const VENEZUELA: Pais = PAISES.find((p) => p.iso2 === 'VE') ?? {
  iso2: 'VE',
  nombre: 'Venezuela',
  codigo: '58',
  bandera: banderaDe('VE'),
}
