import SwiftUI
import WidgetKit

struct GrannytoolsEntry: TimelineEntry {
    let date: Date
}

struct GrannytoolsProvider: TimelineProvider {
    func placeholder(in context: Context) -> GrannytoolsEntry { GrannytoolsEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (GrannytoolsEntry) -> Void) {
        completion(GrannytoolsEntry(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<GrannytoolsEntry>) -> Void) {
        completion(Timeline(entries: [GrannytoolsEntry(date: Date())], policy: .never))
    }
}

struct GrannytoolsWidgetView: View {
    let entry: GrannytoolsEntry
    var body: some View {
        Image("GrannytoolsWidgetIcon")
            .resizable()
            .scaledToFit()
            .accessibilityLabel("Abrir Grannytools")
            .widgetURL(URL(string: "grannytools://open"))
            .containerBackground(for: .widget) { Color.clear }
    }
}

@main
struct GrannytoolsWidget: Widget {
    let kind = "GrannytoolsGiantIcon"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GrannytoolsProvider()) { entry in
            GrannytoolsWidgetView(entry: entry)
        }
        .configurationDisplayName("Grannytools")
        .description("Un único icono gigante para abrir Grannytools.")
        .supportedFamilies([.systemLarge])
        .contentMarginsDisabled()
    }
}