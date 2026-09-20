import UIKit
import WebKit
import CoreLocation
import Speech
import AVFoundation
import UserNotifications
import StoreKit

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
        content.add(self, name: "mwPurchase")
        content.add(self, name: "mwRestorePurchase")
        content.add(self, name: "mwManageSubscriptions")

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
        <!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#05090d;color:#fff;font-family:-apple-system;padding:48px 24px"><h1 style="color:#e9b949">MW DYNASTY</h1><h2>iPhone build is ready for your production URL.</h2><p>Set <b>MWProductionURL</b> in Info.plist to your final HTTPS Vercel/domain URL, then archive the app in Xcode.</p><p style="color:#9fb0bb">App 3.0.16 · Build 9</p></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if message.name == "mwManageSubscriptions" {
            Task { @MainActor [weak self] in
                await self?.openAppStoreSubscriptionManagement()
            }
            return
        }

        if message.name == "mwRestorePurchase" {
            guard let planCode = body["planCode"] as? String,
                  let accessToken = body["accessToken"] as? String,
                  !planCode.isEmpty, !accessToken.isEmpty else {
                sendPurchaseResult(["ok": false, "error": "Your MW session expired. Sign in again."])
                return
            }
            Task { @MainActor [weak self] in
                await self?.restoreMWPurchase(planCode: planCode, accessToken: accessToken)
            }
            return
        }

        if message.name == "mwPurchase" {
            guard let planCode = body["planCode"] as? String,
                  let accessToken = body["accessToken"] as? String,
                  !planCode.isEmpty, !accessToken.isEmpty else {
                sendPurchaseResult(["ok": false, "error": "Your MW session expired. Sign in again."])
                return
            }
            let sponsorQuantity = body["sponsorQuantity"] as? Int ?? 0
            if sponsorQuantity > 0 {
                sendPurchaseResult(["ok": false, "error": "Sponsored-athlete seats are managed separately from the App Store subscription. Choose the Coach membership first, then add sponsored seats from Coach billing."])
                return
            }
            Task { @MainActor [weak self] in
                await self?.beginMWPurchase(planCode: planCode, accessToken: accessToken)
            }
            return
        }

        guard message.name == "mwPermissions", let type = body["type"] as? String else { return }
        permissionType = type
        switch type {
        case "location":
            requestLocationPermission()
        case "voice":
            requestVoicePermission()
        case "notifications":
            requestNotificationPermission()
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

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                DispatchQueue.main.async {
                    self?.sendPermissionResult(["native": true, "granted": true, "type": "notifications"])
                }
            case .denied:
                DispatchQueue.main.async {
                    self?.sendPermissionResult(["native": true, "granted": false, "type": "notifications"])
                }
            case .notDetermined:
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                    DispatchQueue.main.async {
                        self?.sendPermissionResult(["native": true, "granted": granted, "type": "notifications"])
                    }
                }
            @unknown default:
                DispatchQueue.main.async {
                    self?.sendPermissionResult(["native": true, "granted": false, "type": "notifications"])
                }
            }
        }
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

    @MainActor
    private func openAppStoreSubscriptionManagement() async {
        guard let scene = view.window?.windowScene else {
            sendPurchaseResult(["ok": false, "error": "App Store subscription management is unavailable right now."])
            return
        }
        do {
            try await AppStore.showManageSubscriptions(in: scene)
        } catch {
            sendPurchaseResult(["ok": false, "error": "App Store subscription management could not be opened."])
        }
    }

    @MainActor
    private func restoreMWPurchase(planCode: String, accessToken: String) async {
        let products: [String: String] = [
            "mw_athlete": "com.mwdynasty.app.athlete.monthly",
            "coach_core": "com.mwdynasty.app.coach.core.monthly",
            "coach_intelligence": "com.mwdynasty.app.coach.intelligence.monthly",
            "mw_sprint_performance": "com.mwdynasty.app.coach.sprintperformance.monthly"
        ]
        guard let productID = products[planCode], let accountToken = userIDFromJWT(accessToken) else {
            sendPurchaseResult(["ok": false, "error": "Your MW account could not be matched to an App Store membership."])
            return
        }
        do {
            try await AppStore.sync()
            for await entitlement in Transaction.currentEntitlements {
                guard case .verified(let transaction) = entitlement,
                      transaction.productID == productID,
                      transaction.appAccountToken == accountToken else { continue }
                let verified = await verifyPurchaseWithMWServer(transactionID: String(transaction.id), planCode: planCode, accessToken: accessToken)
                if verified {
                    await transaction.finish()
                    sendPurchaseResult(["ok": true, "restored": true, "planCode": planCode, "transactionId": String(transaction.id)])
                    return
                }
            }
            sendPurchaseResult(["ok": false, "error": "No active App Store membership for this MW account was found."])
        } catch {
            sendPurchaseResult(["ok": false, "error": "App Store restore could not finish: \(error.localizedDescription)"])
        }
    }

    @MainActor
    private func beginMWPurchase(planCode: String, accessToken: String) async {
        let products: [String: String] = [
            "mw_athlete": "com.mwdynasty.app.athlete.monthly",
            "coach_core": "com.mwdynasty.app.coach.core.monthly",
            "coach_intelligence": "com.mwdynasty.app.coach.intelligence.monthly",
            "mw_sprint_performance": "com.mwdynasty.app.coach.sprintperformance.monthly"
        ]
        guard let productID = products[planCode] else {
            sendPurchaseResult(["ok": false, "error": "This MW membership is not available for App Store purchase."])
            return
        }
        guard let accountToken = userIDFromJWT(accessToken) else {
            sendPurchaseResult(["ok": false, "error": "Your MW account could not be attached to the App Store purchase. Sign in again."])
            return
        }

        do {
            guard let product = try await Product.products(for: [productID]).first else {
                sendPurchaseResult(["ok": false, "error": "This MW App Store product is not available yet."])
                return
            }
            let result = try await product.purchase(options: [.appAccountToken(accountToken)])
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    let verified = await verifyPurchaseWithMWServer(
                        transactionID: String(transaction.id),
                        planCode: planCode,
                        accessToken: accessToken
                    )
                    if verified {
                        await transaction.finish()
                        sendPurchaseResult(["ok": true, "planCode": planCode, "transactionId": String(transaction.id)])
                    }
                case .unverified(_, _):
                    sendPurchaseResult(["ok": false, "error": "The App Store could not verify this purchase on this device."])
                }
            case .pending:
                sendPurchaseResult(["ok": false, "pending": true, "error": "Your App Store purchase is pending approval. MW access will stay locked until Apple confirms it."])
            case .userCancelled:
                sendPurchaseResult(["ok": false, "cancelled": true, "error": "Purchase cancelled. Your MW membership choice is saved."])
            @unknown default:
                sendPurchaseResult(["ok": false, "error": "The App Store returned an unknown purchase state."])
            }
        } catch {
            sendPurchaseResult(["ok": false, "error": error.localizedDescription])
        }
    }

    private func userIDFromJWT(_ token: String) -> UUID? {
        let parts = token.split(separator: ".")
        guard parts.count > 1 else { return nil }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 { payload += "=" }
        guard let data = Data(base64Encoded: payload),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = json["sub"] as? String else { return nil }
        return UUID(uuidString: sub)
    }

    private func verifyPurchaseWithMWServer(transactionID: String, planCode: String, accessToken: String) async -> Bool {
        guard let url = URL(string: "https://keqgunlfwhjgcsurynef.supabase.co/functions/v1/mw-apple-purchase-verify") else {
            sendPurchaseResult(["ok": false, "error": "MW purchase verification URL is unavailable."])
            return false
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm", forHTTPHeaderField: "apikey")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "transactionId": transactionID,
            "planCode": planCode
        ])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 500
            let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            if (200..<300).contains(status), payload["ok"] as? Bool == true, payload["accessActive"] as? Bool == true {
                return true
            }
            let message = payload["error"] as? String ?? "MW could not confirm the App Store subscription."
            sendPurchaseResult(["ok": false, "error": message])
            return false
        } catch {
            sendPurchaseResult(["ok": false, "error": "The purchase completed, but MW could not confirm access yet. Reopen the app and restore your purchase."])
            return false
        }
    }

    private func sendPurchaseResult(_ result: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(result),
              let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.mwNativePurchaseResult && window.mwNativePurchaseResult(\(json));")
    }

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.prompt)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "mwPermissions")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "mwPurchase")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "mwRestorePurchase")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "mwManageSubscriptions")
    }
}
