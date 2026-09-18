require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AppGroupStore'
  s.version        = package['version']
  s.summary        = 'Expo module for Clipboard iOS App Group storage'
  s.description    = 'Expo module that writes settings and server data into the shared iOS App Group'
  s.license        = 'MIT'
  s.author         = 'clipboard'
  s.homepage       = 'https://github.com/nicepkg/clipboard'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/nicepkg/clipboard.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'

  s.source_files = ['*.swift', 'Shared/**/*.swift']
end
