// Ports of fdlibm 5.3 e_exp.c and e_log.c (Sun Microsystems, freely redistributable). They use
// only IEEE-754-exact operations, so results are bit-identical on every JavaScript engine (TS §4.4).

const words = new DataView(new ArrayBuffer(8));

function highWord(x: number): number {
  words.setFloat64(0, x, true);
  return words.getInt32(4, true);
}

function lowWord(x: number): number {
  words.setFloat64(0, x, true);
  return words.getUint32(0, true);
}

function withHighWord(x: number, high: number): number {
  words.setFloat64(0, x, true);
  words.setInt32(4, high, true);
  return words.getFloat64(0, true);
}

const HUGE = 1.0e300;
const TWO_POW_M1000 = 9.3326361850321887899e-302;
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;

/** Deterministic `exp`, accurate to < 1 ulp. */
export function detExp(x: number): number {
  let hx = highWord(x);
  const negative = hx < 0;
  hx &= 0x7fffffff;

  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lowWord(x)) !== 0) {
        return x + x;
      }
      return negative ? 0 : x;
    }
    if (x > O_THRESHOLD) {
      return HUGE * HUGE;
    }
    if (x < U_THRESHOLD) {
      return TWO_POW_M1000 * TWO_POW_M1000;
    }
  }

  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      hi = negative ? x + LN2_HI : x - LN2_HI;
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = (INV_LN2 * x + (negative ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x;
  }

  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) {
    return 1 - ((x * c) / (c - 2) - x);
  }
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) {
    return withHighWord(y, highWord(y) + (k << 20));
  }
  return withHighWord(y, highWord(y) + ((k + 1000) << 20)) * TWO_POW_M1000;
}

const TWO_POW_54 = 1.8014398509481984e16;
const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

/** Deterministic natural logarithm, accurate to < 1 ulp. */
export function detLog(x: number): number {
  let hx = highWord(x);
  const lx = lowWord(x);
  let k = 0;

  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) {
      return -Infinity;
    }
    if (hx < 0) {
      return NaN;
    }
    k -= 54;
    x *= TWO_POW_54;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) {
    return x + x;
  }
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;

  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) {
      return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;
    }
    const r = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - r : k * LN2_HI - (r - k * LN2_LO - f);
  }

  const s = f / (2 + f);
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i |= j;
  const r = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) {
      return f - (hfsq - s * (hfsq + r));
    }
    return k * LN2_HI - (hfsq - (s * (hfsq + r) + k * LN2_LO) - f);
  }
  if (k === 0) {
    return f - s * (f - r);
  }
  return k * LN2_HI - (s * (f - r) - k * LN2_LO - f);
}
