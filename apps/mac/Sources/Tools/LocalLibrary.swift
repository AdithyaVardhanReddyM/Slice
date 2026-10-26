import Foundation
import SQLite3

/// What's already on this Mac that says something about the user's taste: the podcasts they
/// follow (Podcasts' library, which needs Full Disk Access) and the books in Apple Books.
/// Each library is copied first and read from the copy, so the app that owns it is never locked.
enum LocalLibrary {
    /// Podcast titles, most recently used first; nil when the library can't be read.
    static func podcasts(_ limit: Int) -> [String]? {
        let dir = NSHomeDirectory() + "/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents"
        return read(database: dir + "/MTLibrary.sqlite", table: "ZMTPODCAST", columns: ["ZTITLE"],
                    newestFirst: ["ZLASTDATEPLAYED", "ZLASTTOUCHDATE", "ZADDEDDATE"], limit: limit)?.map { $0[0] }
    }

    /// "Title by Author" pairs from Apple Books, most recently opened first (samples left out).
    static func books(_ limit: Int) -> [(title: String, author: String?)]? {
        let dir = NSHomeDirectory() + "/Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary"
        guard let name = try? FileManager.default.contentsOfDirectory(atPath: dir)
            .first(where: { $0.hasPrefix("BKLibrary") && $0.hasSuffix(".sqlite") }) else { return nil }
        return read(database: dir + "/" + name, table: "ZBKLIBRARYASSET", columns: ["ZTITLE", "ZAUTHOR"],
                    newestFirst: ["ZLASTOPENDATE"], skip: "ZISSAMPLE", limit: limit)?
            .map { (title: $0[0], author: $0.count > 1 && !$0[1].isEmpty ? $0[1] : nil) }
    }

    private static func read(database path: String, table: String, columns: [String], newestFirst: [String],
                             skip: String? = nil, limit: Int) -> [[String]]? {
        let fm = FileManager.default
        let copy = fm.temporaryDirectory.appendingPathComponent("slice-\(UUID().uuidString)", isDirectory: true)
        guard (try? fm.createDirectory(at: copy, withIntermediateDirectories: true)) != nil else { return nil }
        defer { try? fm.removeItem(at: copy) }
        let base = (path as NSString).lastPathComponent
        for suffix in ["", "-wal", "-shm"] where fm.fileExists(atPath: path + suffix) {
            guard (try? fm.copyItem(atPath: path + suffix, toPath: copy.appendingPathComponent(base + suffix).path)) != nil else {
                if suffix.isEmpty { return nil } else { continue }
            }
        }
        var db: OpaquePointer?
        guard sqlite3_open_v2(copy.appendingPathComponent(base).path, &db, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK else {
            sqlite3_close(db)
            return nil
        }
        defer { sqlite3_close(db) }
        // Column names differ between versions; order by the first one this library has.
        let present = Set(query(db, "PRAGMA table_info(\(table))").map { $0.count > 1 ? $0[1] : "" })
        guard columns.allSatisfy(present.contains) else { return nil }
        var sql = "SELECT \(columns.joined(separator: ", ")) FROM \(table) WHERE \(columns[0]) IS NOT NULL"
        if let skip, present.contains(skip) { sql += " AND (\(skip) IS NULL OR \(skip) = 0)" }
        if let order = newestFirst.first(where: present.contains) { sql += " ORDER BY \(order) DESC" }
        sql += " LIMIT \(limit)"
        return query(db, sql)
    }

    private static func query(_ db: OpaquePointer?, _ sql: String) -> [[String]] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(statement) }
        var rows: [[String]] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            rows.append((0..<sqlite3_column_count(statement)).map { i in
                sqlite3_column_text(statement, i).map { String(cString: $0) } ?? ""
            })
        }
        return rows
    }
}
