// Build: swiftc -O ssid.swift -o ssid-helper   (arm64+x86_64: lipo two builds with -target)
// Bundle in app Resources, codesign with the app identity.
// Needs: Info.plist NSLocationUsageDescription (+ NSLocationWhenInUseUsageDescription) and,
// for sandboxed/MAS builds, entitlement com.apple.security.personal-information.location.
// macOS returns nil SSID until the user grants Location permission to the process's responsible app.
import CoreWLAN
import CoreLocation
let mgr = CLLocationManager()
if mgr.authorizationStatus == .notDetermined { mgr.requestWhenInUseAuthorization(); RunLoop.main.run(until: Date().addingTimeInterval(3)) }
if let s = CWWiFiClient.shared().interface()?.ssid(), !s.isEmpty { print(s) } else { exit(1) }
