// IAU 2015 nominal solar luminosity; IAU 2012 exact AU; CODATA 2018 sigma.
export const SOLAR_LUMINOSITY = 3.828e26;
export const AU = 149597870700;
export const SIGMA = 5.670374419e-8;

/** Ideal absorption and outward reradiation with equal collecting/emitting area. */
export function energyBudget(radiusAU, coverage) {
  if (!Number.isFinite(radiusAU) || radiusAU <= 0 || !Number.isFinite(coverage) || coverage <= 0 || coverage > 1) {
    throw new RangeError('Require radius > 0 and 0 < coverage <= 1.');
  }
  const sphereArea = 4 * Math.PI * (radiusAU * AU) ** 2;
  const flux = SOLAR_LUMINOSITY / sphereArea;
  return { flux, power: coverage * SOLAR_LUMINOSITY, area: coverage * sphereArea, temperature: (flux / SIGMA) ** .25 };
}
