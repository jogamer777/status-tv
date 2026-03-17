const express = require('express');
const fetch = require('node-fetch');

module.exports = function(config) {
  const router = express.Router();

  // GET /api/printers — all printers status
  router.get('/', async (req, res) => {
    const results = {};

    // CRX-Pro via OctoPrint
    try {
      const headers = { 'X-Api-Key': config.printers.crx_pro.api_key };
      const [printerRes, jobRes] = await Promise.all([
        fetch(`${config.printers.crx_pro.url}/api/printer`, { headers, timeout: 3000 }),
        fetch(`${config.printers.crx_pro.url}/api/job`,     { headers, timeout: 3000 })
      ]);
      const data = await printerRes.json();
      const job  = await jobRes.json();
      results.crx_pro = {
        online: true,
        state: data.state?.text || 'Unknown',
        filename: job.job?.file?.name || '',
        progress: job.progress?.completion != null ? job.progress.completion / 100 : 0,
        print_time_left: job.progress?.printTimeLeft || 0,
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
      const r = await fetch(`${config.printers.k2.url}/printer/objects/query?print_stats&extruder&heater_bed&display_status`, {
        timeout: 3000
      });
      const data = await r.json();
      const s = data.result?.status || {};
      const printDuration = s.print_stats?.print_duration || 0;
      const progress = s.display_status?.progress || 0;
      const printTimeLeft = progress > 0 ? Math.round(printDuration / progress - printDuration) : 0;
      results.k2 = {
        online: true,
        state: s.print_stats?.state || 'Unknown',
        filename: s.print_stats?.filename || '',
        progress,
        print_time_left: printTimeLeft > 0 ? printTimeLeft : 0,
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
