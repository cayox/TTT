// Build: sh build/make-helper.sh, which wraps this in "TTT Location.app" (see there for why it is an app).
// Shipped in the app's Resources; TTT runs Contents/MacOS/ssid-helper inside it directly.
//
// macOS hides the Wi-Fi name from every process until the user grants Location access, so this
// helper both asks for that access and reads the name once it is granted.
//   ssid-helper            print the current SSID; exit 1 if there is none to print
//   ssid-helper --status   print the Location authorization status; never prompts
//   ssid-helper --request  prompt if the status is still undecided, then print the status
//   ssid-helper --locate   print "<lat> <lon> <accuracy m>" of the current location; exit 1 without one
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

/// One CLLocationManager for the whole run. A fresh manager reports `.notDetermined` until locationd
/// has registered the client and sent the first authorization callback, so nothing reads the status
/// before `ready()` has seen that callback.
final class Location: NSObject, CLLocationManagerDelegate {
  private enum Mode { case idle, request, locate }
  private let mgr = CLLocationManager()
  private var mode = Mode.idle
  private var gotAuth = false
  private var done = false
  private var fix: CLLocation?

  override init() {
    super.init()
    mgr.delegate = self
  }

  private func spin(_ timeout: TimeInterval, until finished: () -> Bool) {
    let deadline = Date().addingTimeInterval(timeout)
    while !finished() && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
  }

  /// The authorization status once locationd has answered (or after a short wait if it never does).
  func ready() -> CLAuthorizationStatus {
    spin(2) { gotAuth }
    return mgr.authorizationStatus
  }

  /// Prompts if undecided and waits for the answer: `requestWhenInUseAuthorization` returns immediately.
  func request(timeout: TimeInterval) -> CLAuthorizationStatus {
    let s = ready()
    if s != .notDetermined { return s }
    mode = .request
    // Asking for an actual location is what reliably makes locationd show the prompt.
    mgr.requestWhenInUseAuthorization()
    mgr.startUpdatingLocation()
    spin(timeout) { done }
    mgr.stopUpdatingLocation()
    return mgr.authorizationStatus
  }

  /// One fix. macOS locates a Mac from nearby Wi-Fi, so it usually comes within a second or two.
  func locate(timeout: TimeInterval) -> CLLocation? {
    let s = ready()
    if s == .notDetermined || s == .denied || s == .restricted { return nil }
    mode = .locate
    mgr.desiredAccuracy = kCLLocationAccuracyHundredMeters
    mgr.startUpdatingLocation()
    spin(timeout) { done }
    mgr.stopUpdatingLocation()
    return fix
  }

  func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
    gotAuth = true
    let s = m.authorizationStatus
    if s == .denied || s == .restricted || (mode == .request && s != .notDetermined) { done = true }
  }

  func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let l = locations.last, l.horizontalAccuracy >= 0 else { return }
    fix = l
    // A cached fix can be stale; when locating, keep waiting for a recent one (the timeout takes what there is).
    if mode == .request || -l.timestamp.timeIntervalSinceNow < 120 { done = true }
  }

  func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
    // kCLErrorDenied arrives once the user says no; other errors (no fix yet) keep waiting.
    if (error as? CLError)?.code == .denied { done = true }
  }
}

// Held for the whole run: CLLocationManager's delegate is a weak reference.
let location = Location()
switch CommandLine.arguments.dropFirst().first {
case "--status":
  print(name(location.ready()))
case "--request":
  // Generous: the prompt stays up until the user answers it.
  print(name(location.request(timeout: 60)))
case "--locate":
  if let l = location.locate(timeout: 10) {
    print(String(format: "%.6f %.6f %.0f", l.coordinate.latitude, l.coordinate.longitude, l.horizontalAccuracy))
  } else { exit(1) }
default:
  // Never prompts: the app asks for access explicitly (--request), polling for the name must not block.
  if let s = CWWiFiClient.shared().interface()?.ssid(), !s.isEmpty { print(s) } else { exit(1) }
}
