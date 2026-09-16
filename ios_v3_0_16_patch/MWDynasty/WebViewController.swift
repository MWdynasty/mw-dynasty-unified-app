import UIKit
import WebKit
import CoreLocation
import Speech
import AVFoundation

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, CLLocationManagerDelegate {
    private var webView: WKWebView!
    private let locationManager = CLLocationManager()
    private var permissionType: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 5/255, green: 9/255, blue: 13/255, alpha: 1)
        locationManager.delegate = self

        let content = WKUserContentController()
        content.add(self, name: "mwPermissions")

        let config = WKWebViewConfiguration()
        config.userContentController = content
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.customUserAgent = "MWDynasty-iOS/3.0.16"
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        loadMWDynasty()
    }

    private func loadMWDynasty() {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "MWProductionURL") as? String,
              !raw.contains("REPLACE-WITH"),
              let url = URL(string: raw),
              url.scheme == "https" else {
            showConfigurationMessage()
            return
        }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadRevalidatingCacheData
        webView.load(request)
    }

    private func showConfigurationMessage() {
        let html = """
        <!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#05090d;color:#fff;font-family:-apple-system;padding:48px 24px"><h1 style="color:#e9b949">MW DYNASTY</h1><h2>iPhone build is ready for your production URL.</h2><p>Set <b>MWProductionURL</b> in Info.plist to your final HTTPS Vercel/domain URL, then archive the app in Xcode.</p><p style="color:#9fb0bb">App 3.0.16 · Build 7</p></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "mwPermissions", let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        permissionType = type
        switch type {
        case "location":
            requestLocationPermission()
        case "voice":
            requestVoicePermission()
        default:
            sendPermissionResult(["native": true, "granted": false, "type": type])
        }
    }

    private func requestLocationPermission() {
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            sendPermissionResult(["native": true, "granted": true, "type": "location"])
        case .denied, .restricted:
            sendPermissionResult(["native": true, "granted": false, "type": "location"])
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        @unknown default:
            sendPermissionResult(["native": true, "granted": false, "type": "location"])
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard permissionType == "location" else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            sendPermissionResult(["native": true, "granted": true, "type": "location"])
        case .denied, .restricted:
            sendPermissionResult(["native": true, "granted": false, "type": "location"])
        case .notDetermined:
            break
        @unknown default:
            sendPermissionResult(["native": true, "granted": false, "type": "location"])
        }
    }

    private func requestVoicePermission() {
        let finish: (Bool) -> Void = { [weak self] micGranted in
            SFSpeechRecognizer.requestAuthorization { speechStatus in
                DispatchQueue.main.async {
                    let speechGranted = speechStatus == .authorized
                    self?.sendPermissionResult(["native": true, "granted": micGranted && speechGranted, "microphone": micGranted, "speech": speechGranted, "type": "voice"])
                }
            }
        }

        AVAudioSession.sharedInstance().requestRecordPermission { granted in finish(granted) }
    }

    private func sendPermissionResult(_ result: [String: Any]) {
        permissionType = nil
        guard JSONSerialization.isValidJSONObject(result),
              let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.mwNativePermissionResult && window.mwNativePermissionResult(\(json));")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showConnectionError(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showConnectionError(error.localizedDescription)
    }

    private func showConnectionError(_ detail: String) {
        let escaped = detail.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
        let html = """
        <!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#05090d;color:#fff;font-family:-apple-system;padding:48px 24px"><h1 style="color:#e9b949">MW DYNASTY</h1><h2>Connection needed</h2><p>MW Dynasty needs an internet connection to sync training, Coach MW, and your account.</p><p style="color:#9fb0bb">\(escaped)</p><button onclick="location.reload()" style="padding:14px 18px;border:0;border-radius:10px;background:#e9b949;font-weight:800">TRY AGAIN</button></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.prompt)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "mwPermissions")
    }
}
