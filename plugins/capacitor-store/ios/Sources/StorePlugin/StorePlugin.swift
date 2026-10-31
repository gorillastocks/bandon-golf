import Capacitor
import StoreKit

/// Minimal StoreKit 2 bridge for ONE non-consumable ("All Courses"). JS name: "Store".
/// Methods: getProduct, isEntitled, purchase, restore. Every method resolves (never rejects) so the game keeps working
/// when the store is unreachable; failures are reported through the "status" / "found" / "error" fields.
/// Event: "entitlementChanged" { owned: Bool } when a transaction update arrives (Ask to Buy approval, refund, other device).
@objc(StorePlugin)
public class StorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorePlugin"
    public let jsName = "Store"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEntitled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    /// Called by Capacitor when the plugin loads (app launch): listen for transactions that finish outside a purchase call.
    public override func load() {
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
                let owned = await StorePlugin.isOwned(StorePlugin.productId(nil))
                self?.notifyListeners("entitlementChanged", data: ["owned": owned])
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }


    static func productId(_ id: String?) -> String {
        return id ?? "com.gorillastocks.abandoneddunes.fullgame"
    }

    /// True when the signed, non-revoked entitlement for the product exists (works offline from the on-device receipt cache).
    static func isOwned(_ id: String) async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == id, transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        let id = StorePlugin.productId(call.getString("productId"))
        Task {
            do {
                let products = try await Product.products(for: [id])
                guard let product = products.first else {
                    call.resolve(["found": false])
                    return
                }
                call.resolve([
                    "found": true,
                    "id": product.id,
                    "displayName": product.displayName,
                    "displayPrice": product.displayPrice,
                    "price": NSDecimalNumber(decimal: product.price).doubleValue
                ])
            } catch {
                call.resolve(["found": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func isEntitled(_ call: CAPPluginCall) {
        let id = StorePlugin.productId(call.getString("productId"))
        Task {
            let owned = await StorePlugin.isOwned(id)
            call.resolve(["owned": owned])
        }
    }

    /// status: "success" | "pending" (Ask to Buy / SCA) | "cancelled" | "unavailable" | "failed"
    @objc func purchase(_ call: CAPPluginCall) {
        let id = StorePlugin.productId(call.getString("productId"))
        Task {
            do {
                let products = try await Product.products(for: [id])
                guard let product = products.first else {
                    call.resolve(["status": "unavailable"])
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["status": "success", "owned": true])
                    case .unverified:
                        call.resolve(["status": "failed", "error": "Purchase could not be verified"])
                    }
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "failed"])
                }
            } catch {
                call.resolve(["status": "failed", "error": error.localizedDescription])
            }
        }
    }

    /// Restore Purchases: sync with the App Store (may ask for the Apple ID password), then re-read the entitlements.
    @objc func restore(_ call: CAPPluginCall) {
        let id = StorePlugin.productId(call.getString("productId"))
        Task {
            var err: String? = nil
            do {
                try await AppStore.sync()
            } catch {
                err = error.localizedDescription
            }
            let owned = await StorePlugin.isOwned(id)
            var out: [String: Any] = ["owned": owned]
            if let err = err, !owned { out["error"] = err }
            call.resolve(out)
        }
    }
}
