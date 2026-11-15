// Stamp the icon, version and company info into Case Canvas.exe.
// Used as electron-builder's afterPack hook (and runnable by hand: node build/stamp.js [path-to-exe]).
// electron-builder's own resource editing is disabled (signAndEditExecutable: false) because its signing-tool
// download needs admin symlink rights on Windows; rcedit needs nothing of the sort.
'use strict';
const path = require('path');
const fs = require('fs');
const rceditMod = require('rcedit');
const rcedit = typeof rceditMod === 'function' ? rceditMod : (rceditMod.rcedit || rceditMod.default);
const pkg = require('../package.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function stamp(exe) {
  if (!fs.existsSync(exe)) throw new Error('stamp: exe not found: ' + exe);
  const options = {
    icon: path.join(__dirname, 'icon.ico'),
    'file-version': pkg.version,
    'product-version': pkg.version,
    'version-string': {
      CompanyName: 'Stuthi Labs Private Limited',
      ProductName: pkg.build.productName,
      FileDescription: pkg.build.productName,
      LegalCopyright: `Copyright © ${new Date().getFullYear()} Stuthi Labs Private Limited`,
      OriginalFilename: `${pkg.build.productName}.exe`
    }
  };
  // Right after packaging the exe is often still held open (antivirus scan of the new file), which makes
  // rcedit fail with "Unable to commit changes"; wait and retry for up to a minute.
  let lastErr = null;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try { await rcedit(exe, options); console.log(`  • stamped icon and version info into ${exe} (attempt ${attempt})`); return; }
    catch (err) { lastErr = err; await sleep(3000); }
  }
  throw new Error('stamp failed: ' + (lastErr && lastErr.message));
}

// afterPack hook
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  await stamp(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`));
};

if (require.main === module) {
  stamp(process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked', `${pkg.build.productName}.exe`))
    .catch(err => { console.error(err.message); process.exit(1); });
}
