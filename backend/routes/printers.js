const express = require('express');
const fetch = require('node-fetch');

module.exports = function(config) {
  const router = express.Router();

  // GET /api/printers — all printers status
  router.get('/', async (req, res) => {
    const results = {};

    // CRX-Pro via OctoPrint
    try {
      const r = await fetch(`${config.printers.crx_pro.url}/api/printer`, {
        headers: { 'X-Api-Key': config.printers.crx_pro.api_key },
        timeout: 3000
      });
      const data = await r.json();
      results.crx_pro = {
        online: true,
        state: data.state?.text || 'Unknown',
        temps: {
          hotend: data.temperature?.tool0?.actual,
          hotend_target: data.temperature?.tool0?.target,
          bed: data.temperature?.bed?.actual,
          bed_target: data.temperature?.bed?.target
        }
      };
    } catch (e) {
      results.crx_pro = { online: false, error: e.message };
    }

    // K2 via Moonraker
    try {
      const r = await fetch(`${config.printers.k2.url}/printer/objects/query?print_stats&extruder&heater_bed`, {
        timeout: 3000
      });
      const data = await r.json();
      const s = data.result?.status || {};
      results.k2 = {
        online: true,
        state: s.print_stats?.state || 'Unknown',
        filename: s.print_stats?.filename || '',
        progress: s.display_status?.progress || 0,
        temps: {
          hotend: s.extruder?.temperature,
          hotend_target: s.extruder?.target,
          bed: s.heater_bed?.temperature,
          bed_target: s.heater_bed?.target
        }
      };
    } catch (e) {
      results.k2 = { online: false, error: e.message };
    }

    res.json(results);
  });

  return router;
};
