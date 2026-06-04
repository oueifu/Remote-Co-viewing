try {
  const a = require('electron');
  console.log('electron-type=' + typeof a);
  console.log('electron-value=' + String(a));
} catch (error) {
  console.error('electron-error=' + error.message);
}
try {
  const b = require('electron/main');
  console.log('electron-main-keys=' + Object.keys(b).join(','));
} catch (error) {
  console.error('electron-main-error=' + error.message);
}
