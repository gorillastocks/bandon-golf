# Read-mostly probe (creates at most an unsubmitted draft review submission).
def j(x) = JSON.generate(x)
def try
  yield
rescue StandardError => e
  puts "  !! #{e.message[0, 700]}"
end
APP = $asc_app_id
VID = "986ae8da-60b5-47fd-8c7c-00aca56cfe2e"
bs = Spaceship::ConnectAPI::App.find("com.gorillastocks.blackspire")
puts "== blackspire IAPs"
try { asc_call(:get, "apps/#{bs.id}/inAppPurchasesV2", nil, { limit: 10 })["data"].each { |x| puts "#{x['attributes']['productId']} #{x['attributes']['state']}" } }
puts "== our IAP"
iid = "6829324900"
try { puts j(asc_call(:get, "v2/inAppPurchases/#{iid}", nil, { include: "inAppPurchaseLocalizations,appStoreReviewScreenshot,iapPriceSchedule" }).slice("data", "included").to_s[0, 2500]) }
try { puts "avail: " + asc_call(:get, "v2/inAppPurchases/#{iid}/inAppPurchaseAvailability", nil, { include: "availableTerritories", limit: 2 }).to_s[0, 600] }
try { puts "sched: " + asc_call(:get, "v2/inAppPurchases/#{iid}/iapPriceSchedule", nil, { include: "manualPrices,baseTerritory" }).to_s[0, 800] }
puts "== version relationships"
try { puts asc_call(:get, "appStoreVersions/#{VID}")["data"]["relationships"].keys.join(",") }
puts "== draft review submission"
try do
  subs = asc_call(:get, "apps/#{APP}/reviewSubmissions", nil, { limit: 10 })["data"]
  puts "existing: " + subs.map { |s| "#{s['id']} #{s['attributes']['state']}" }.join(" | ")
  sub = subs.find { |s| s["attributes"]["state"] == "READY_FOR_REVIEW" } || asc_call(:post, "reviewSubmissions", { data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: APP } } } } })["data"]
  puts "draft #{sub['id']}"
  its = asc_call(:get, "reviewSubmissions/#{sub['id']}/items")["data"]
  puts "items: #{its.size}"
  try { asc_call(:post, "reviewSubmissionItems", { data: { type: "reviewSubmissionItems", relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: sub["id"] } }, inAppPurchase: { data: { type: "inAppPurchases", id: iid } } } } }); puts "IAP ITEM ADDED" }
end
