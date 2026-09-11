/**
 * Code 128 / Code 39 Barcode SVG Generator
 * Generates high-contrast vector barcode SVGs suitable for high-resolution A6 waybills.
 */

// Code 128 Pattern Tables (Subset B)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_B = 104;
const STOP = 106;

export function generateBarcodeSVG(text: string, width = 280, height = 70): string {
  const sanitized = text.replace(/[^A-Za-z0-9-_]/g, '').toUpperCase() || 'TRK-000000';
  
  // Calculate Code 128B symbols
  const codes: number[] = [START_B];
  let checkSum = START_B;

  for (let i = 0; i < sanitized.length; i++) {
    const charCode = sanitized.charCodeAt(i);
    const codeVal = charCode - 32; // ASCII 32 to 126 maps to 0 to 94
    if (codeVal >= 0 && codeVal <= 94) {
      codes.push(codeVal);
      checkSum += codeVal * (i + 1);
    }
  }

  const checkCode = checkSum % 103;
  codes.push(checkCode);
  codes.push(STOP);

  // Convert codes to bar pattern string
  let patternStr = '';
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    patternStr += pattern;
  }

  // Calculate total modules
  let totalModules = 0;
  for (let i = 0; i < patternStr.length; i++) {
    totalModules += parseInt(patternStr[i], 10);
  }

  const moduleWidth = width / (totalModules + 20); // quiet zone
  let currentX = 10 * moduleWidth;
  const rects: string[] = [];

  for (let i = 0; i < patternStr.length; i++) {
    const barWidth = parseInt(patternStr[i], 10) * moduleWidth;
    const isBar = i % 2 === 0; // Alternates: bar, space, bar, space...
    if (isBar) {
      rects.push(
        `<rect x="${currentX.toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="#000000" />`
      );
    }
    currentX += barWidth;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 22}" width="100%" height="${height + 22}" style="display:block;margin:0 auto;">
      <g>
        ${rects.join('\n        ')}
      </g>
      <text x="${(width / 2).toFixed(1)}" y="${height + 16}" text-anchor="middle" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="bold" fill="#000000" letter-spacing="3">${sanitized}</text>
    </svg>
  `.trim();
}
