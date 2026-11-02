import UIKit
import UserNotifications

extension Notification.Name {
    static let mwAPNSTokenAvailable = Notification.Name("mwAPNSTokenAvailable")
    static let mwPushNotificationOpened = Notification.Name("mwPushNotificationOpened")
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?
    private let pendingPushKey = "mwPendingPushNotification"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "mwAPNSDeviceToken")
        NotificationCenter.default.post(name: .mwAPNSTokenAvailable, object: token)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        let payload = userInfo["mw"] as? [String: Any] ?? [:]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            completionHandler()
            return
        }
        UserDefaults.standard.set(json, forKey: pendingPushKey)
        NotificationCenter.default.post(name: .mwPushNotificationOpened, object: json)
        completionHandler()
    }

    static func consumePendingPushNotification() -> String? {
        let key = "mwPendingPushNotification"
        guard let payload = UserDefaults.standard.string(forKey: key) else { return nil }
        UserDefaults.standard.removeObject(forKey: key)
        return payload
    }
}
