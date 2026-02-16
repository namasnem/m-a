const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const form = document.getElementById('calc-form');
const citizensInput = document.getElementById('citizens');
const votingSeatsField = document.getElementById('voting-seats-field');
const votingSeatsInput = document.getElementById('voting-seats');
const sampleBtn = document.getElementById('sample-btn');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const summaryEl = document.getElementById('result-summary');
const detailsEl = document.getElementById('result-details');

const preferredMagnitudes = [5, 4, 6];

const roundHalfUp = (x) => Math.round(x);
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

const summariseMagnitudes = (mags) => {
  const map = {};
  mags.forEach((m) => {
    map[m] = (map[m] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0])));
};

const chooseStvPlan = (totalSeats, preferred = preferredMagnitudes) => {
  if (totalSeats === 0) {
    return { magnitudes: [], note: 'no STV seats' };
  }

  for (const m of preferred) {
    if (m > 0 && totalSeats % m === 0) {
      return { magnitudes: Array(totalSeats / m).fill(m), note: `uniform ${m}-seat STV constituencies` };
    }
  }

  for (const base of preferred) {
    if (base < 3) continue;

    const k0 = Math.floor(totalSeats / base);
    let r = totalSeats - base * k0;
    const mags = Array(k0).fill(base);

    if (r === 0) {
      return { magnitudes: mags, note: `mixed plan base ${base} (exact)` };
    }

    if ([3, 4, 5, 6].includes(r)) {
      mags.push(r);
      return { magnitudes: mags, note: `mixed plan base ${base} + one ${r}-seat constituency` };
    }

    let conversions = 0;
    while ([1, 2].includes(r) && conversions < mags.length) {
      mags[conversions] = base - 1;
      conversions += 1;
      r += 1;
    }

    if ([3, 4, 5, 6].includes(r)) {
      mags.push(r);
      return {
        magnitudes: mags,
        note: `mixed plan base ${base} with ${conversions} downgraded constituencies + one ${r}-seat constituency`,
      };
    }
  }

  return { magnitudes: [totalSeats], note: 'fallback: single STV constituency (not recommended)' };
};

const stvTargetsByMagnitude = (citizens, stvSeatsTotal, magnitudes) => {
  if (stvSeatsTotal <= 0) return {};
  const cps = citizens / stvSeatsTotal;
  const counts = summariseMagnitudes(magnitudes);
  const out = {};

  Object.entries(counts).forEach(([m, count]) => {
    out[m] = {
      count,
      targetPopulationPerConstituency: Number(m) * cps,
      citizensPerStvSeat: cps,
    };
  });

  return out;
};

const calcMandatorium = (citizens) => {
  const S = ceilDiv(citizens, 300000);
  const S_L = roundHalfUp(0.3 * S);
  const S_D = S - S_L;

  const { magnitudes, note } = chooseStvPlan(S_D);

  return {
    citizens,
    totalMandators: S,
    citizensPerMandatorOverall: citizens / S,
    prSeats: S_L,
    prConstituencies: 1,
    citizensPerPrSeat: S_L > 0 ? citizens / S_L : Infinity,
    citizensPerPrConstituency: citizens,
    stvSeats: S_D,
    stvConstituencies: magnitudes.length,
    stvPlanNote: note,
    stvMagnitudes: magnitudes,
    stvCountsByMagnitude: summariseMagnitudes(magnitudes),
    stvTargets: stvTargetsByMagnitude(citizens, S_D, magnitudes),
  };
};

const ascendiumAllocation = (N) => {
  if (N >= 200) {
    const H = 33;
    let D = Math.max(33, Math.floor((N - 34) / 5));
    let V = 2 * D;
    let P = N - (H + D + V);

    while (P <= V && D > 33) {
      D -= 1;
      V = 2 * D;
      P = N - (H + D + V);
    }

    return { P, V, D, H, regime: 'A (N >= 200)' };
  }

  const H0 = Math.floor(N / 6);
  const D = H0;
  const V = 2 * D;
  const P0 = N - 4 * H0;

  let H;
  let P;

  if (P0 > V) {
    H = H0;
    P = P0;
  } else {
    const k = (V - P0) + 1;
    H = H0 - k;
    P = P0 + k;
  }

  if (H < 0) {
    throw new Error('Ascendium constraints overdetermined for this N. Increase N.');
  }

  return { P, V, D, H, regime: 'B (N < 200)' };
};

const calcAscendium = (citizens, votingSeats) => {
  const { P, V, D, H, regime } = ascendiumAllocation(votingSeats);
  const { magnitudes, note } = chooseStvPlan(P);

  return {
    citizens,
    votingSeats,
    regime,
    popularSeats: P,
    vocationalSeats: V,
    diarchicSeats: D,
    hereditarySeats: H,
    citizensPerPopularSeat: P > 0 ? citizens / P : Infinity,
    popularStvConstituencies: magnitudes.length,
    popularStvPlanNote: note,
    popularStvMagnitudes: magnitudes,
    popularStvCountsByMagnitude: summariseMagnitudes(magnitudes),
    popularStvTargets: stvTargetsByMagnitude(citizens, P, magnitudes),
  };
};

const format = (n, digits = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

const metricCard = (label, value) => `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div></article>`;

const targetTable = (targets) => {
  const rows = Object.entries(targets)
    .map(([mag, data]) => `
      <tr>
        <td>${mag}</td>
        <td>${format(data.count)}</td>
        <td>${format(data.targetPopulationPerConstituency)}</td>
        <td>${format(data.citizensPerStvSeat, 2)}</td>
      </tr>
    `)
    .join('');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Magnitude (seats)</th>
            <th>Constituency count</th>
            <th>Target population / constituency</th>
            <th>Citizens per STV seat</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
};

const renderMandatorium = (result) => {
  summaryEl.innerHTML = [
    metricCard('Total Mandators (S)', format(result.totalMandators)),
    metricCard('PR Seats (S_L)', format(result.prSeats)),
    metricCard('STV Seats (S_D)', format(result.stvSeats)),
    metricCard('STV Constituencies', format(result.stvConstituencies)),
    metricCard('Citizens / Mandator', format(result.citizensPerMandatorOverall, 2)),
    metricCard('Citizens / PR Seat', Number.isFinite(result.citizensPerPrSeat) ? format(result.citizensPerPrSeat, 2) : '∞'),
  ].join('');

  detailsEl.innerHTML = `
    <div class="callout">
      <strong>STV plan:</strong> ${result.stvPlanNote}<br>
      <strong>Magnitudes:</strong> ${result.stvMagnitudes.join(', ') || 'None'}
    </div>
    ${targetTable(result.stvTargets)}
  `;
};

const renderAscendium = (result) => {
  summaryEl.innerHTML = [
    metricCard('Regime', result.regime),
    metricCard('Popular Seats (P)', format(result.popularSeats)),
    metricCard('Vocational Seats (V)', format(result.vocationalSeats)),
    metricCard('Diarchic Seats (D)', format(result.diarchicSeats)),
    metricCard('Hereditary Seats (H)', format(result.hereditarySeats)),
    metricCard('Citizens / Popular Seat', format(result.citizensPerPopularSeat, 2)),
  ].join('');

  detailsEl.innerHTML = `
    <div class="callout">
      <strong>Popular STV plan:</strong> ${result.popularStvPlanNote}<br>
      <strong>Magnitudes:</strong> ${result.popularStvMagnitudes.join(', ') || 'None'}
    </div>
    ${targetTable(result.popularStvTargets)}
  `;
};

const getMode = () => modeInputs.find((r) => r.checked)?.value || 'mandatorium';

const updateModeUi = () => {
  const isAsc = getMode() === 'ascendium';
  votingSeatsField.hidden = !isAsc;
  votingSeatsInput.required = isAsc;
};

modeInputs.forEach((input) => input.addEventListener('change', updateModeUi));
updateModeUi();

sampleBtn.addEventListener('click', () => {
  citizensInput.value = 450000000;
  votingSeatsInput.value = getMode() === 'ascendium' ? 200 : '';
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  errorEl.textContent = '';

  const mode = getMode();
  const citizens = Number(citizensInput.value);

  if (!Number.isInteger(citizens) || citizens < 1) {
    errorEl.textContent = 'Please enter a valid integer for total citizens.';
    resultsEl.hidden = true;
    return;
  }

  try {
    if (mode === 'mandatorium') {
      const result = calcMandatorium(citizens);
      renderMandatorium(result);
    } else {
      const votingSeats = Number(votingSeatsInput.value);
      if (!Number.isInteger(votingSeats) || votingSeats < 1) {
        throw new Error('Please enter a valid integer for Ascendium voting seats (N).');
      }
      const result = calcAscendium(citizens, votingSeats);
      renderAscendium(result);
    }
    resultsEl.hidden = false;
  } catch (err) {
    errorEl.textContent = err.message || 'Calculation failed. Please check your values.';
    resultsEl.hidden = true;
  }
});
