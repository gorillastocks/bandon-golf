# Read-only inspection of version 1.0 submission readiness. Never prints secrets or emails.
def j(x) = JSON.generate(x)
def short(h, *keys) = keys.map { |k| "#{k}=#{h[k].inspect}" }.join(" ")
APP = $asc_app_id
def try
  yield
rescue StandardError => e
  puts "  !! #{e.message[0, 300]}"
  nil
end

puts "== app"
a = try { asc_call(:get, "apps/#{APP}")["data"]["attributes"] }
puts short(a, "name", "bundleId", "primaryLocale", "contentRightsDeclaration") if a
puts "== versions"
vs = asc_call(:get, "apps/#{APP}/appStoreVersions", nil, { limit: 10 })["data"]
vs.each { |v| puts "#{v['id']} #{short(v['attributes'], 'versionString', 'platform', 'appStoreState', 'releaseType', 'copyright')}" }
ver = vs.find { |v| v["attributes"]["versionString"] == "1.0" }
vid = ver["id"]
puts "== version localizations"
try { asc_call(:get, "appStoreVersions/#{vid}/appStoreVersionLocalizations")["data"].each { |l| puts "#{l['id']} " + short(l["attributes"], "locale", "supportUrl", "marketingUrl", "keywords", "promotionalText", "whatsNew") + " desc_len=#{l['attributes']['description'].to_s.size}" } }
puts "== build"
try { b = asc_call(:get, "appStoreVersions/#{vid}/build")["data"]; puts b.nil? ? "no build attached" : "attached build #{b['id']} #{short(b['attributes'], 'version', 'processingState')}" }
try { asc_call(:get, "builds", nil, { "filter[app]" => APP, limit: 10, sort: "-uploadedDate" })["data"].each { |b| puts "build #{b['id']} #{short(b['attributes'], 'version', 'processingState', 'usesNonExemptEncryption', 'expired', 'uploadedDate')}" } }
puts "== appInfos"
infos = asc_call(:get, "apps/#{APP}/appInfos")["data"]
infos.each do |i|
  puts "#{i['id']} #{short(i['attributes'], 'state', 'appStoreState', 'appStoreAgeRating', 'ageRatingOverride')}"
  try { puts "  categories: " + j(asc_call(:get, "appInfos/#{i['id']}", nil, { include: "primaryCategory,secondaryCategory,primarySubcategoryOne,primarySubcategoryTwo,secondarySubcategoryOne,secondarySubcategoryTwo" })["data"]["relationships"].transform_values { |v| v.dig("data", "id") }) }
  try { asc_call(:get, "appInfos/#{i['id']}/appInfoLocalizations")["data"].each { |l| puts "  loc #{l['id']} " + short(l["attributes"], "locale", "name", "subtitle", "privacyPolicyUrl") } }
  try { puts "  ageRating: " + j(asc_call(:get, "appInfos/#{i['id']}/ageRatingDeclaration")["data"]["attributes"]) }
end
puts "== review detail"
try { r = asc_call(:get, "appStoreVersions/#{vid}/appStoreReviewDetail")["data"]; puts r.nil? ? "none" : "#{r['id']} " + j(r["attributes"].reject { |k, _| %w[contactEmail contactPhone contactFirstName contactLastName].include?(k) }.merge("contactSet" => !r["attributes"]["contactEmail"].to_s.empty?)) }
try { asc_call(:get, "appStoreReviewDetails/#{(asc_call(:get, "appStoreVersions/#{vid}/appStoreReviewDetail")["data"] || {})['id']}/appStoreReviewAttachments")["data"].each { |x| puts "attachment #{x['id']} #{j(x['attributes'].slice('fileName', 'fileSize', 'assetDeliveryState'))}" } }
puts "== screenshots"
try do
  asc_call(:get, "appStoreVersionLocalizations/#{asc_call(:get, "appStoreVersions/#{vid}/appStoreVersionLocalizations")['data'][0]['id']}/appScreenshotSets")["data"].each do |s|
    shots = asc_call(:get, "appScreenshotSets/#{s['id']}/appScreenshots")["data"]
    puts "#{s['attributes']['screenshotDisplayType']} count=#{shots.size} " + shots.map { |x| x["attributes"]["assetDeliveryState"]["state"] }.join(",")
  end
end
puts "== app privacy / encryption / pricing"
try { puts "encryption declarations: " + asc_call(:get, "apps/#{APP}/appEncryptionDeclarations")["data"].map { |x| short(x["attributes"], "appEncryptionDeclarationState") }.join(";") }
try { puts "price schedule: " + asc_call(:get, "apps/#{APP}/appPriceSchedule")["data"].to_h["id"].to_s }
try { puts "availability: " + (asc_call(:get, "apps/#{APP}/appAvailabilityV2")["data"] || {})["id"].to_s }
puts "== IAP"
try do
  asc_call(:get, "apps/#{APP}/inAppPurchasesV2", nil, { limit: 10 })["data"].each do |x|
    puts "#{x['id']} #{short(x['attributes'], 'productId', 'state', 'name', 'reviewNote')}"
    try { asc_call(:get, "v2/inAppPurchases/#{x['id']}/inAppPurchaseLocalizations")["data"].each { |l| puts "  loc #{j(l['attributes'])}" } }
    try { puts "  reviewScreenshot: " + j((asc_call(:get, "v2/inAppPurchases/#{x['id']}/appStoreReviewScreenshot")["data"] || {})["attributes"].to_h.slice("fileName", "assetDeliveryState")) }
  end
end
puts "== game center"
gcd = try { asc_call(:get, "apps/#{APP}/gameCenterDetail")["data"] }
if gcd
  puts "gcDetail #{gcd['id']} #{j(gcd['attributes'])}"
  try { puts "leaderboards: " + asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterLeaderboards", nil, { limit: 200 })["data"].size.to_s }
  try { puts "achievements: " + asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterAchievements", nil, { limit: 200 })["data"].size.to_s }
  try { puts "versions: " + asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterAppVersions", nil, { limit: 20 })["data"].map { |x| "#{x['id']} #{j(x['attributes'])}" }.join(" | ") }
  try { puts "leaderboardSets: " + asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterLeaderboardSets")["data"].size.to_s }
end
puts "== submissions"
try { asc_call(:get, "apps/#{APP}/reviewSubmissions", nil, { limit: 10 })["data"].each { |x| puts "#{x['id']} #{j(x['attributes'])}" } }
