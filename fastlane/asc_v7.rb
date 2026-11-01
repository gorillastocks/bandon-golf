# Release helper for Abandoned Dunes (run by the "iOS App Review submission" workflow, MODE=v7_*).
#   v7_status   read-only: version, builds, review submissions, IAP, Game Center titles, screenshots, review attachments
#   v7_cancel   cancel any open App Review submission for the app (removes the version from review)
# Never prints secrets or contact details.
require "digest"
require "net/http"
APP = $asc_app_id
MODE = ENV.fetch("MODE", "v7_status")
def j(x) = JSON.generate(x)
def say(s) = puts("▶ #{s}")
def rel(type, id) = { data: { type: type, id: id } }

ver = asc_call(:get, "apps/#{APP}/appStoreVersions", nil, { limit: 10 })["data"].find { |v| v["attributes"]["versionString"] == "1.0" }
VID = ver["id"]

def status
  v = asc_call(:get, "appStoreVersions/#{VID}")["data"]["attributes"]
  say "version 1.0 state=#{v['appStoreState']} releaseType=#{v['releaseType']}"
  b = begin
    asc_call(:get, "appStoreVersions/#{VID}/build")["data"]
  rescue StandardError
    nil
  end
  say "attached build: #{b ? j(b['attributes'].slice('version', 'processingState', 'expired')) : 'none'}"
  asc_call(:get, "builds", nil, { "filter[app]" => APP, limit: 10, sort: "-uploadedDate" })["data"].each do |x|
    puts "  build #{x['attributes']['version']} #{x['attributes']['processingState']} expired=#{x['attributes']['expired']} uploaded=#{x['attributes']['uploadedDate']}"
  end
  asc_call(:get, "apps/#{APP}/reviewSubmissions", nil, { limit: 10 })["data"].each do |s|
    items = asc_call(:get, "reviewSubmissions/#{s['id']}/items", nil, { limit: 10 })["data"] rescue []
    puts "  reviewSubmission #{s['id']} state=#{s['attributes']['state']} submitted=#{s['attributes']['submittedDate']} items=#{items.size}"
  end
  iap = asc_call(:get, "apps/#{APP}/inAppPurchasesV2", nil, { "filter[productId]" => "com.gorillastocks.abandoneddunes.fullgame" })["data"].first
  say "IAP #{iap['id']} state=#{iap['attributes']['state']}"
  loc = asc_call(:get, "appStoreVersions/#{VID}/appStoreVersionLocalizations")["data"].find { |l| l["attributes"]["locale"] == "en-US" }
  a = loc["attributes"]
  say "listing: desc #{a['description'].to_s.size} chars, keywords=#{a['keywords']}, promo=#{a['promotionalText'].to_s[0, 60]}..., realish=#{a['description'].to_s =~ /real elevation|aerial/i ? 'YES' : 'no'}"
  asc_call(:get, "appStoreVersionLocalizations/#{loc['id']}/appScreenshotSets")["data"].each do |s|
    sh = asc_call(:get, "appScreenshotSets/#{s['id']}/appScreenshots")["data"]
    puts "  screenshots #{s['attributes']['screenshotDisplayType']}: #{sh.size} #{sh.map { |x| x['attributes']['assetDeliveryState']['state'] }.tally}"
  end
  rd = asc_call(:get, "appStoreVersions/#{VID}/appStoreReviewDetail")["data"]
  if rd
    at = asc_call(:get, "appStoreReviewDetails/#{rd['id']}/appStoreReviewAttachments")["data"]
    say "review detail: notes #{rd['attributes']['notes'].to_s.size} chars, mentions OSM=#{rd['attributes']['notes'].to_s =~ /OpenStreetMap|USGS/ ? 'YES' : 'no'}, attachments=#{at.map { |x| "#{x['attributes']['fileName']} #{x['attributes']['fileSize']}" }}"
  end
  gcd = asc_call(:get, "apps/#{APP}/gameCenterDetail")["data"]
  lbs = asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterLeaderboards", nil, { limit: 200 })["data"]
  say "Game Center: #{lbs.size} leaderboards"
  names = lbs.map do |lb|
    ls = asc_call(:get, "gameCenterLeaderboards/#{lb['id']}/localizations")["data"].map { |l| l["attributes"]["name"] }
    "#{lb['attributes']['vendorIdentifier'].sub('abandoneddunes.lb.', '')}=#{ls.join('|')}(ref:#{lb['attributes']['referenceName']})"
  end
  puts names.map { |x| "  #{x}" }
  achs = asc_call(:get, "gameCenterDetails/#{gcd['id']}/gameCenterAchievements", nil, { limit: 200 })["data"]
  achs.each do |a2|
    ls = asc_call(:get, "gameCenterAchievements/#{a2['id']}/localizations")["data"].map { |l| "#{l['attributes']['name']} / #{l['attributes']['beforeEarnedDescription']} / #{l['attributes']['afterEarnedDescription']}" }
    puts "  ach #{a2['attributes']['vendorIdentifier'].sub('abandoneddunes.ach.', '')}=#{ls.join('|')}"
  end
end

case MODE
when "v7_status" then status
when "v7_cancel"
  say "cancel open review submissions"
  asc_call(:get, "apps/#{APP}/reviewSubmissions", nil, { limit: 20 })["data"].each do |s|
    st = s["attributes"]["state"]
    puts "  #{s['id']} state=#{st}"
    next unless %w[WAITING_FOR_REVIEW READY_FOR_REVIEW UNRESOLVED_ISSUES IN_REVIEW].include?(st)
    begin
      r = asc_call(:patch, "reviewSubmissions/#{s['id']}", { data: { type: "reviewSubmissions", id: s["id"], attributes: { canceled: true } } })
      puts "  -> canceled requested, state now #{r['data']['attributes']['state']}"
    rescue StandardError => e
      puts "  !! cancel failed: #{e.message[0, 600]}"
    end
  end
  sleep 5
  status
when "v7_attach"
  say "attach build 7 to version 1.0 (no submission)"
  ver = asc_call(:get, "apps/#{APP}/appStoreVersions", nil, { limit: 10 })["data"].find { |v| v["attributes"]["versionString"] == "1.0" }
  b = asc_call(:get, "builds", nil, { "filter[app]" => APP, "filter[version]" => "7", limit: 5 })["data"].first or raise "build 7 not found"
  raise "build 7 state #{b['attributes']['processingState']}" unless b["attributes"]["processingState"] == "VALID"
  asc_call(:patch, "appStoreVersions/#{ver['id']}/relationships/build", { data: { type: "builds", id: b["id"] } })
  asc_call(:patch, "appStoreVersions/#{ver['id']}", { data: { type: "appStoreVersions", id: ver["id"], attributes: { releaseType: "AFTER_APPROVAL" } } })
  if b["attributes"]["usesNonExemptEncryption"].nil?
    asc_call(:patch, "builds/#{b['id']}", { data: { type: "builds", id: b["id"], attributes: { usesNonExemptEncryption: false } } })
    puts "  set usesNonExemptEncryption=false"
  end
  sleep 3
  status
else
  raise "unknown MODE #{MODE}"
end
