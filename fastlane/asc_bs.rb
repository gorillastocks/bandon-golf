def j(x) = JSON.generate(x)
app = $asc_app_id
v = asc_call(:get, "apps/#{app}/appStoreVersions", nil, { limit: 1 })["data"].first
vid = v["id"]
puts "version #{j(v['attributes'].slice('versionString','appStoreState','releaseType','copyright'))}"
l = asc_call(:get, "appStoreVersions/#{vid}/appStoreVersionLocalizations")["data"].first
puts "loc keys: desc=#{l['attributes']['description'].to_s.size} kw=#{l['attributes']['keywords'].to_s.size} support=#{!l['attributes']['supportUrl'].nil?}"
asc_call(:get, "appStoreVersionLocalizations/#{l['id']}/appScreenshotSets")["data"].each do |s|
  sh = asc_call(:get, "appScreenshotSets/#{s['id']}/appScreenshots")["data"]
  puts "#{s['attributes']['screenshotDisplayType']}: #{sh.map { |x| x['attributes']['assetDeliveryState']['state'] }.tally}"
end
puts "build: #{j(asc_call(:get, "appStoreVersions/#{vid}/build")['data']['attributes'].slice('version','processingState'))}"
rd = asc_call(:get, "appStoreVersions/#{vid}/appStoreReviewDetail")["data"]
puts "review detail notes=#{rd['attributes']['notes'].to_s.size} attachments=#{asc_call(:get, "appStoreReviewDetails/#{rd['id']}/appStoreReviewAttachments")['data'].size}"
puts "review submissions: #{asc_call(:get, "apps/#{app}/reviewSubmissions", nil, { limit: 5 })['data'].map { |s| s['attributes']['state'] }}"
