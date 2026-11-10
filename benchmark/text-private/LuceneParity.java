// Development-only Lucene 10.4.0 reference for the text-private retrieval experiment.
// Run with the Lucene core and analysis-common 10.4.0 jars on the classpath:
//   java -cp core.jar:analysis-common.jar LuceneParity.java analyze INPUT OUTPUT
//   java -cp core.jar:analysis-common.jar LuceneParity.java bm25 INPUT OUTPUT
// INPUT lines are base64 UTF-8. analyze: one text per line; output one line per
// text with terms separated by U+0001. bm25: blocks of "Q <id> <docs> <hits>",
// <docs> document lines and one query line; output "<id>\t<doc>:<score> ...".
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.en.EnglishAnalyzer;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StoredField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.Term;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.ByteBuffersDirectory;

public class LuceneParity {
    static String decode(String line) {
        return new String(Base64.getDecoder().decode(line), StandardCharsets.UTF_8);
    }

    static java.util.List<String> terms(Analyzer analyzer, String text) throws Exception {
        java.util.List<String> out = new java.util.ArrayList<>();
        try (TokenStream stream = analyzer.tokenStream("text", text)) {
            CharTermAttribute term = stream.addAttribute(CharTermAttribute.class);
            stream.reset();
            while (stream.incrementToken()) out.add(term.toString());
            stream.end();
        }
        return out;
    }

    public static void main(String[] args) throws Exception {
        Analyzer analyzer = new EnglishAnalyzer();
        try (BufferedReader in = Files.newBufferedReader(Path.of(args[1]), StandardCharsets.UTF_8);
             BufferedWriter out = Files.newBufferedWriter(Path.of(args[2]), StandardCharsets.UTF_8)) {
            if (args[0].equals("analyze")) {
                for (String line; (line = in.readLine()) != null; ) {
                    out.write(String.join("\u0001", terms(analyzer, decode(line))));
                    out.write('\n');
                }
                return;
            }
            for (String header; (header = in.readLine()) != null; ) {
                String[] parts = header.split(" ");
                int docs = Integer.parseInt(parts[2]), hits = Integer.parseInt(parts[3]);
                ByteBuffersDirectory directory = new ByteBuffersDirectory();
                try (IndexWriter writer = new IndexWriter(directory, new IndexWriterConfig(analyzer))) {
                    for (int i = 0; i < docs; i++) {
                        Document doc = new Document();
                        doc.add(new StoredField("n", i));
                        doc.add(new TextField("text", decode(in.readLine()), Field.Store.NO));
                        writer.addDocument(doc);
                    }
                }
                String query = decode(in.readLine());
                // Mirror LambdaDB MatchQueryBuilder: one SHOULD TermQuery per analyzed token.
                BooleanQuery.Builder builder = new BooleanQuery.Builder();
                for (String term : terms(analyzer, query)) builder.add(new TermQuery(new Term("text", term)), BooleanClause.Occur.SHOULD);
                StringBuilder line = new StringBuilder(parts[1]).append('\t');
                try (DirectoryReader reader = DirectoryReader.open(directory)) {
                    IndexSearcher searcher = new IndexSearcher(reader);
                    TopDocs top = searcher.search(builder.build(), hits);
                    for (ScoreDoc hit : top.scoreDocs) {
                        int n = searcher.storedFields().document(hit.doc).getField("n").numericValue().intValue();
                        line.append(n).append(':').append(hit.score).append(' ');
                    }
                }
                out.write(line.toString().trim());
                out.write('\n');
            }
        }
    }
}
