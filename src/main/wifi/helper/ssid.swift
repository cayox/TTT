// Build: sh build/make-helper.sh (see there for the embedded Info.plist and the universal binary).
// Bundle in app Resources, codesign with the app identity.
//
// macOS hides the Wi-Fi name from every process until the user grants Location access, so this
// helper both asks for that access and reads the name once it is granted.
//   ssid-helper            print the current SSID; exit 1 if there is none to print
//   ssid-helper --status   print the Location authorization status; never prompts
//   ssid-helper --request  prompt if the status is still undecided, then print the status
import CoreWLAN
import CoreLocation
import Foundation

func name(_ s: CLAuthorizationStatus) -> String {
  switch s {
  case .notDetermined: return "notDetermined"
  case .denied: return "denied"
  case .restricted: return "restricted"
  default: return "granted"
  }
}

/// Waits for the authorization callback: `requestWhenInUseAuthorization` returns immediately and
/// the status only changes once the user answers the system prompt.
final class Auth: NSObject, CLLocationManagerDelegate {
  private let mgr = CLLocationManager()
  private var settled = false
  var status: CLAuthorizationStatus { mgr.authorizationStatus }

  func request(timeout: TimeInterval) -> CLAuthorizationStatus {
    mgr.delegate = self
    if mgr.authorizationStatus != .notDetermined { return mgr.authorizationStatus }
    mgr.requestWhenInUseAuthorization()
    let deadline = Date().addingTimeInterval(timeout)
    while !settled && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
    return mgr.authorizationStatus
  }

  func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
    if m.authorizationStatus != .notDetermined { settled = true }
  }
}

// Held for the whole run: CLLocationManager's delegate is a weak reference.
let auth = Auth()
switch CommandLine.arguments.dropFirst().first {
case "--status":
  print(name(auth.status))
case "--request":
  // Generous: the prompt stays up until the user answers it.
  print(name(auth.request(timeout: 120)))
default:
  // Never prompts: the app asks for access explicitly (--request), polling for the name must not block.
  if let s = CWWiFiClient.shared().interface()?.ssid(), !s.isEmpty { print(s) } else { exit(1) }
}
