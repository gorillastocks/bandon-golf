import Capacitor
import GameKit
import UIKit

/// Minimal Game Center bridge. JS name: "GameCenter".
/// Methods: signIn, isSignedIn, submitScore, showLeaderboard, showLeaderboards, unlockAchievement, showAchievements.
/// Nothing here ever throws into JS for "not signed in" / "declined": calls resolve with { ok: false } so the game keeps working.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate, GKTurnBasedMatchmakerViewControllerDelegate, GKTurnBasedEventListener {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSignedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboards", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise),
        // async turn-based multiplayer ("Your Own Time"), see TurnBased.swift
        CAPPluginMethod(name: "mpLoadMatches", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpLoadMatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpCreateMatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpAutoMatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpSaveData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpSubmitTurn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpQuit", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mpRemove", returnType: CAPPluginReturnPromise)
    ]

    private var authStarted = false
    private var waiting: [CAPPluginCall] = []
    private var authDone = false
    var listenerRegistered = false

    /// Called by Capacitor when the plugin loads (app launch): authenticate silently; if Game Center needs the
    /// player to sign in, Apple's sheet is presented once. Declining just leaves the game un-authenticated.
    public override func load() {
        startAuth()
    }

    private func startAuth() {
        if authStarted { return }
        authStarted = true
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
                guard let self = self else { return }
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                self.authDone = true
                let signedIn = GKLocalPlayer.local.isAuthenticated
                if signedIn && !self.listenerRegistered { self.listenerRegistered = true; GKLocalPlayer.local.register(self) }   // turn events (TurnBased.swift)
                let calls = self.waiting; self.waiting = []
                calls.forEach { $0.resolve(["signedIn": signedIn]) }
                self.notifyListeners("authChanged", data: ["signedIn": signedIn])
            }
        }
    }

    @objc func signIn(_ call: CAPPluginCall) {
        startAuth()
        if authDone || GKLocalPlayer.local.isAuthenticated {
            call.resolve(["signedIn": GKLocalPlayer.local.isAuthenticated])
        } else {
            waiting.append(call)
        }
    }

    @objc func isSignedIn(_ call: CAPPluginCall) {
        call.resolve(["signedIn": GKLocalPlayer.local.isAuthenticated])
    }

    /// { leaderboardId: string, score: number }
    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated, let id = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.resolve(["ok": false]); return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            call.resolve(["ok": error == nil])
        }
    }

    /// { leaderboardId: string }  -> opens that leaderboard
    @objc func showLeaderboard(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated, let id = call.getString("leaderboardId") else { call.resolve(["ok": false]); return }
        DispatchQueue.main.async {
            let vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            self.present(vc); call.resolve(["ok": true])
        }
    }

    /// Opens the Game Center leaderboards list.
    @objc func showLeaderboards(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["ok": false]); return }
        DispatchQueue.main.async {
            self.present(GKGameCenterViewController(state: .leaderboards)); call.resolve(["ok": true])
        }
    }

    /// { achievementId: string, percent?: number (default 100) }
    @objc func unlockAchievement(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated, let id = call.getString("achievementId") else { call.resolve(["ok": false]); return }
        let a = GKAchievement(identifier: id)
        a.percentComplete = call.getDouble("percent") ?? 100
        a.showsCompletionBanner = true
        GKAchievement.report([a]) { error in call.resolve(["ok": error == nil]) }
    }

    @objc func showAchievements(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["ok": false]); return }
        DispatchQueue.main.async {
            self.present(GKGameCenterViewController(state: .achievements)); call.resolve(["ok": true])
        }
    }

    private func present(_ vc: GKGameCenterViewController) {
        vc.gameCenterDelegate = self
        bridge?.viewController?.present(vc, animated: true)
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
