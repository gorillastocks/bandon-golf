# Read-only: Blackspire review notes (emails/phones masked).
bs = Spaceship::ConnectAPI::App.find("com.gorillastocks.blackspire")
v = asc_call(:get, "apps/#{bs.id}/appStoreVersions", nil, { limit: 5 })["data"].first
r = asc_call(:get, "appStoreVersions/#{v['id']}/appStoreReviewDetail")["data"]
n = r["attributes"]["notes"].to_s.gsub(/[\w.+-]+@[\w.-]+/, "<email>").gsub(/\+?\d[\d\s().-]{7,}\d/, "<phone>")
n.split("\n").each { |l| puts "NOTE| #{l}" }
