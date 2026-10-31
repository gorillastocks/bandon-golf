import Capacitor
import GameKit
import UIKit

/// Asynchronous "Your Own Time" multiplayer on top of Game Center turn-based matches (GKTurnBasedMatch).
/// One player's turn == their whole round. The match carries a small JSON string (matchData, built by js/mp.js).
/// Every method resolves (never rejects): { ok: Bool, error?: String, ... }.
let mpTurnTimeout: TimeInterval = 7 * 24 * 3600   // a player who doesn't play within 7 days is skipped by Game Center

extension GameCenterPlugin {
    // MARK: helpers

    private func mpMyID() -> String { GKLocalPlayer.local.gamePlayerID }

    func mpSummary(_ m: GKTurnBasedMatch) -> [String: Any] {
        let me = mpMyID()
        var parts: [[String: Any]] = []
        for p in m.participants {
            var status = "unknown"
            switch p.status {
            case .invited: status = "invited"
            case .declined: status = "declined"
            case .matching: status = "matching"
            case .active: status = "active"
            case .done: status = "done"
            default: status = "unknown"
            }
            var outcome = "none"
            switch p.matchOutcome {
            case .quit: outcome = "quit"
            case .won: outcome = "won"
            case .lost: outcome = "lost"
            case .tied: outcome = "tied"
            case .timeExpired: outcome = "timeout"
            default: outcome = "none"
            }
            let pid = p.player?.gamePlayerID ?? ""
            parts.append(["id": pid, "name": p.player?.displayName ?? "Auto-match player", "status": status, "outcome": outcome, "me": (!pid.isEmpty && pid == me)])
        }
        var mstatus = "unknown"
        switch m.status {
        case .open: mstatus = "open"
        case .ended: mstatus = "ended"
        case .matching: mstatus = "matching"
        default: mstatus = "unknown"
        }
        let cur = m.currentParticipant
        let curID = cur?.player?.gamePlayerID ?? ""
        let myTurn = (mstatus == "open" || mstatus == "matching") && !curID.isEmpty && curID == me
        var out: [String: Any] = [
            "matchID": m.matchID,
            "status": mstatus,
            "myTurn": myTurn,
            "currentName": cur?.player?.displayName ?? "an opponent",
            "participants": parts,
            "data": String(data: m.matchData ?? Data(), encoding: .utf8) ?? "",
            "created": m.creationDate.timeIntervalSince1970 * 1000
        ]
        if let t = cur?.timeoutDate { out["timeoutAt"] = t.timeIntervalSince1970 * 1000 }
        if let t = cur?.lastTurnDate { out["lastTurn"] = t.timeIntervalSince1970 * 1000 }
        return out
    }

    private func mpFail(_ call: CAPPluginCall, _ msg: String) { call.resolve(["ok": false, "error": msg]) }

    private func mpWithMatch(_ call: CAPPluginCall, _ body: @escaping (GKTurnBasedMatch) -> Void) {
        guard GKLocalPlayer.local.isAuthenticated else { mpFail(call, "Not signed in to Game Center"); return }
        guard let id = call.getString("matchID") else { mpFail(call, "No match"); return }
        GKTurnBasedMatch.load(withID: id) { match, error in
            if let m = match { body(m) } else { self.mpFail(call, error?.localizedDescription ?? "Match not found") }
        }
    }

    /// Who plays next: participants after me (in order), still in the game, who haven't already submitted a round.
    private func mpNext(_ m: GKTurnBasedMatch, doneIDs: [String]) -> [GKTurnBasedParticipant] {
        let me = mpMyID()
        let ps = m.participants
        guard let idx = ps.firstIndex(where: { $0.player?.gamePlayerID == me }) else { return [] }
        var res: [GKTurnBasedParticipant] = []
        for k in 1..<max(ps.count, 2) {
            if k >= ps.count { break }
            let p = ps[(idx + k) % ps.count]
            if p.status == .done || p.status == .declined { continue }
            if let pid = p.player?.gamePlayerID, doneIDs.contains(pid) { continue }
            res.append(p)
        }
        return res
    }

    private func mpData(_ call: CAPPluginCall) -> Data { (call.getString("data") ?? "").data(using: .utf8) ?? Data() }

    // MARK: methods

    @objc func mpLoadMatches(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["ok": false, "error": "Not signed in to Game Center", "matches": []]); return }
        GKTurnBasedMatch.loadMatches { matches, error in
            if let error = error, matches == nil { call.resolve(["ok": false, "error": error.localizedDescription, "matches": []]); return }
            call.resolve(["ok": true, "matches": (matches ?? []).map { self.mpSummary($0) }])
        }
    }

    @objc func mpLoadMatch(_ call: CAPPluginCall) {
        mpWithMatch(call) { m in call.resolve(["ok": true, "match": self.mpSummary(m)]) }
    }

    /// Opens Apple's Game Center friend picker (2-4 players). The new match arrives through the "matchEvent" listener.
    @objc func mpCreateMatch(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { mpFail(call, "Not signed in to Game Center"); return }
        let req = GKMatchRequest()
        req.minPlayers = 2
        req.maxPlayers = max(2, min(4, call.getInt("maxPlayers") ?? 4))
        req.defaultNumberOfPlayers = 2
        req.inviteMessage = call.getString("message") ?? "Join me for a round of Abandoned Dunes!"
        DispatchQueue.main.async {
            let vc = GKTurnBasedMatchmakerViewController(matchRequest: req)
            vc.turnBasedMatchmakerDelegate = self
            vc.showExistingMatches = false
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve(["ok": true])
        }
    }

    /// Random-opponent match: { players: 2...4 }
    @objc func mpAutoMatch(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { mpFail(call, "Not signed in to Game Center"); return }
        let req = GKMatchRequest()
        let n = max(2, min(4, call.getInt("players") ?? 2))
        req.minPlayers = n
        req.maxPlayers = n
        req.defaultNumberOfPlayers = n
        GKTurnBasedMatch.find(for: req) { match, error in
            if let m = match { call.resolve(["ok": true, "match": self.mpSummary(m)]) }
            else { self.mpFail(call, error?.localizedDescription ?? "Couldn't find a match") }
        }
    }

    /// { matchID, data } keep the turn, just store the match setup / progress.
    @objc func mpSaveData(_ call: CAPPluginCall) {
        let data = mpData(call)
        mpWithMatch(call) { m in
            m.saveCurrentTurn(withMatch: data) { error in
                if let error = error { self.mpFail(call, error.localizedDescription) } else { call.resolve(["ok": true]) }
            }
        }
    }

    /// { matchID, data, doneIDs: [playerID], outcomes: { playerID: "won"|"lost"|"tied" } }
    /// Ends my turn (my whole round was just stored in data). If nobody is left to play the match is ended with the outcomes.
    @objc func mpSubmitTurn(_ call: CAPPluginCall) {
        let data = mpData(call)
        let doneIDs = (call.getArray("doneIDs") as? [String]) ?? []
        let outcomes = (call.getObject("outcomes") as? [String: String]) ?? [:]
        mpWithMatch(call) { m in
            let next = self.mpNext(m, doneIDs: doneIDs)
            if next.isEmpty {
                for p in m.participants {
                    if let pid = p.player?.gamePlayerID, let o = outcomes[pid] {
                        switch o {
                        case "won": p.matchOutcome = .won
                        case "tied": p.matchOutcome = .tied
                        default: p.matchOutcome = .lost
                        }
                    } else if p.matchOutcome == .none {
                        p.matchOutcome = .lost
                    }
                }
                m.endMatchInTurn(withMatch: data) { error in
                    if let error = error { self.mpFail(call, error.localizedDescription) } else { call.resolve(["ok": true, "ended": true]) }
                }
            } else {
                m.endTurn(withNextParticipants: next, turnTimeout: mpTurnTimeout, match: data) { error in
                    if let error = error { self.mpFail(call, error.localizedDescription) } else { call.resolve(["ok": true, "ended": false]) }
                }
            }
        }
    }

    /// { matchID, data?, doneIDs? } forfeit / leave the match (works in or out of turn).
    @objc func mpQuit(_ call: CAPPluginCall) {
        let data = mpData(call)
        let doneIDs = (call.getArray("doneIDs") as? [String]) ?? []
        mpWithMatch(call) { m in
            let done: (Error?) -> Void = { error in
                if let error = error { self.mpFail(call, error.localizedDescription) } else { call.resolve(["ok": true]) }
            }
            let me = self.mpMyID()
            if m.currentParticipant?.player?.gamePlayerID == me {
                let next = self.mpNext(m, doneIDs: doneIDs)
                if next.isEmpty {
                    for p in m.participants {
                        if p.player?.gamePlayerID == me { p.matchOutcome = .quit }
                        else if p.matchOutcome == .none { p.matchOutcome = .won }
                    }
                    m.endMatchInTurn(withMatch: data, completionHandler: done)
                } else {
                    m.participantQuitInTurn(with: .quit, nextParticipants: next, turnTimeout: mpTurnTimeout, match: data, completionHandler: done)
                }
            } else {
                m.participantQuitOutOfTurn(with: .quit, withCompletionHandler: done)
            }
        }
    }

    /// { matchID } remove a finished match from my list.
    @objc func mpRemove(_ call: CAPPluginCall) {
        mpWithMatch(call) { m in
            m.remove { error in
                if let error = error { self.mpFail(call, error.localizedDescription) } else { call.resolve(["ok": true]) }
            }
        }
    }

    // MARK: GKTurnBasedEventListener (turn / end notifications, also fired for a match I just created or was invited to)

    public func player(_ player: GKPlayer, receivedTurnEventFor match: GKTurnBasedMatch, didBecomeActive: Bool) {
        DispatchQueue.main.async {
            if let presented = self.bridge?.viewController?.presentedViewController, presented is GKTurnBasedMatchmakerViewController {
                presented.dismiss(animated: true)
            }
            self.notifyListeners("matchEvent", data: ["type": "turn", "becameActive": didBecomeActive, "match": self.mpSummary(match)])
        }
    }

    public func player(_ player: GKPlayer, matchEnded match: GKTurnBasedMatch) {
        DispatchQueue.main.async {
            self.notifyListeners("matchEvent", data: ["type": "ended", "becameActive": false, "match": self.mpSummary(match)])
        }
    }

    public func player(_ player: GKPlayer, wantsToQuitMatch match: GKTurnBasedMatch) {
        // Game Center asks the app to quit a match on the player's behalf (e.g. from the Game Center UI)
        let next = mpNext(match, doneIDs: [])
        if next.isEmpty { return }
        match.participantQuitInTurn(with: .quit, nextParticipants: next, turnTimeout: mpTurnTimeout, match: match.matchData ?? Data()) { _ in }
    }

    // MARK: GKTurnBasedMatchmakerViewControllerDelegate

    public func turnBasedMatchmakerViewControllerWasCancelled(_ viewController: GKTurnBasedMatchmakerViewController) {
        viewController.dismiss(animated: true)
        notifyListeners("matchEvent", data: ["type": "cancelled", "becameActive": false])
    }

    public func turnBasedMatchmakerViewController(_ viewController: GKTurnBasedMatchmakerViewController, didFailWithError error: Error) {
        viewController.dismiss(animated: true)
        notifyListeners("matchEvent", data: ["type": "error", "error": error.localizedDescription, "becameActive": false])
    }
}
