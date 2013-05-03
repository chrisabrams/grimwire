Changes
=======

2013/05/03 pfraze

 - Added inline style sanitization/whitelisting
   - supports padding (clamped), margin (clamped), width, height, max-width, max-height, color, background, font, line-height, letter-spacing, text-align, text-decoration, border, box-shadow, vertical-align, overflow, white-space


2013/05/02 pfraze
 
 - Added request link header with user 'storage' href
 - Added cookie support
 - Added data-value-[class|id|value]of widgets


2013/05/01 pfraze

 - Added app enable/disable
 - Added request link header to user storage
 - Added data-toggle="nav"


2013/04/30 pfraze
 
 - Added app editing & uninstall
 - Added worker source-editing


2013/04/29 pfraze

 - Add app installation from file
 - Added response notifications with pnotify


2013/04/27 pfraze

 - Added application configuration
 - Added /.grim/config convention for worker server config pages


2013/04/26 pfraze

 - Added local.client.GrimRegion with grim-layout behaviors


2013/04/25 pfraze

 - Rebuilt /servers/env/config.js to...
   - Load config from the host
   - Mix that config with the user's session storage
   - Build the active applications and workers from that config
 - Added data-grim-layout directives