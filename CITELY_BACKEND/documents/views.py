import uuid

from django.http import FileResponse
from rest_framework import viewsets, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.decorators import action, authentication_classes, permission_classes
from .models import Document, Citation, Recommendation, InsertedCitation
from .serializers import (
    DocumentSerializer,
    DocumentUpdateSerializer,
    DocumentListSerializer,
    InsertedCitationSerializer,
    RecommendationSerializer,
)
from .services.pdf_engine import (
    extract_sentences, 
    detect_gaps, 
    extract_manuscript_html,
    extract_manuscript_from_blocks
)
from .services.docx_engine import extract_docx_sentences, extract_manuscript_html_from_docx
from .services.manuscript_export import build_manuscript_docx
from .services.reference_list import (
    build_merged_reference_list,
    build_reference_list_from_inserted,
    strip_references_section_from_html,
)
from .services.manuscript_html import normalize_manuscript_html
import re
from html import unescape
from .services.api_client import (
    fetch_recommendations,
    fetch_recommendations_for_sentence,
    search_papers,
    _sanitize_sentence,
)


def _html_to_plain_text(html_content):
    text = re.sub(r"<[^>]+>", " ", html_content or "")
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _build_manuscript_from_sentence_objects(sentence_objects):
    parts = []
    for obj in sentence_objects:
        text = (obj.get("clean_text") or obj.get("text") or "").strip()
        if text:
            parts.append(text)
    if not parts:
        return []
    plain = "\n\n".join(parts)
    return [{"id": str(uuid.uuid4()), "text": plain}]


def _build_manuscript_paragraphs(file_bytes, sentence_objects, file_name=None):
    if file_bytes:
        if file_name and file_name.lower().endswith(".docx"):
            try:
                html = extract_manuscript_html_from_docx(file_bytes)
                if html:
                    return [{"id": str(uuid.uuid4()), "html": html, "text": _html_to_plain_text(html)}]
            except Exception as e:
                print(f"DOCX HTML extraction failed: {e}")
                pass
        else:
            try:
                # Use the robust block extraction as the primary method
                text = extract_manuscript_from_blocks(file_bytes)
                if text:
                    return [{"id": str(uuid.uuid4()), "text": text}]
            except Exception as e:
                print(f"Block extraction failed: {e}")
                pass

    return _build_manuscript_from_sentence_objects(sentence_objects)


def _seed_manuscript_if_empty(document, sentence_objects, file_bytes=None):
    if document.manuscript_content:
        return
    file_name = document.file.name if document and document.file else None
    paragraphs = _build_manuscript_paragraphs(file_bytes, sentence_objects, file_name)
    if paragraphs:
        document.manuscript_content = paragraphs
        document.save(update_fields=["manuscript_content"])


def _parse_year_value(value):
    if value is None or value == "":
        return None
    try:
        y = int(value)
        if 1900 <= y <= 2100:
            return y
    except (TypeError, ValueError):
        pass
    return None


def _request_param(request, key):
    if hasattr(request, "query_params") and key in request.query_params:
        return request.query_params.get(key)
    return request.data.get(key) if hasattr(request, "data") else None


def _year_range_from_request(request, document=None):
    """Resolve year_from/year_to from request body, query string, or linked document."""
    year_from = _parse_year_value(_request_param(request, "year_from"))
    year_to = _parse_year_value(_request_param(request, "year_to"))
    if document is not None:
        if year_from is None and document.year_from is not None:
            year_from = document.year_from
        if year_to is None and document.year_to is not None:
            year_to = document.year_to
    if year_from is not None and year_to is not None and year_from > year_to:
        year_from, year_to = year_to, year_from
    return year_from, year_to


def _clear_document_citation_analysis(document):
    """
    Clear SciBERT gaps and literature recommendations before re-analysis.
    Null InsertedCitation FKs first so SQLite does not block citation deletes.
    """
    InsertedCitation.objects.filter(document=document).update(
        recommendation=None,
        citation_gap=None,
    )
    document.citations.all().delete()


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    authentication_classes = []
    permission_classes = (AllowAny,)

    def get_queryset(self):
        if self.action == "list":
            return Document.objects.all()
            
        return Document.objects.prefetch_related(
            "citations__recommendations",
            "inserted_citations",
        )

    def get_serializer_class(self):
        if self.action == "list":
            return DocumentListSerializer
        if self.action in ("partial_update", "update"):
            return DocumentUpdateSerializer
        return DocumentSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        doc = serializer.save()
        if not doc.title:
            doc.title = doc.file.name.split("/")[-1]
            doc.save()
        headers = self.get_success_headers(serializer.data)
        return Response(
            self.get_serializer(doc).data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = DocumentUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DocumentSerializer(instance, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="manuscript")
    def manuscript(self, request, pk=None):
        document = self.get_object()
        return Response(
            {
                "manuscript_content": document.manuscript_content or [],
                "citation_style": document.citation_style,
                "inserted_citations": InsertedCitationSerializer(
                    document.inserted_citations.all(), many=True
                ).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="seed-manuscript")
    def seed_manuscript(self, request, pk=None):
        document = self.get_object()
        force = (
            request.query_params.get("force") == "true"
            or request.data.get("force") is True
        )
        if document.manuscript_content and not force:
            return Response(
                {
                    "manuscript_content": document.manuscript_content,
                    "seeded": False,
                }
            )
        if not document.file:
            return Response(
                {"error": "Document has no PDF file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        document.file.open("rb")
        try:
            file_bytes = document.file.read()
        finally:
            document.file.close()
            
        file_name = document.file.name.lower()
        if file_name.endswith('.docx'):
            sentence_objects = extract_docx_sentences(file_bytes)
        else:
            sentence_objects = extract_sentences(file_bytes)
            
        paragraphs = _build_manuscript_paragraphs(file_bytes, sentence_objects, document.file.name)
        document.manuscript_content = paragraphs
        document.save(update_fields=["manuscript_content"])
        return Response(
            {
                "manuscript_content": document.manuscript_content,
                "seeded": True,
            }
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="export-manuscript",
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def export_manuscript(self, request, pk=None):
        document = self.get_object()
        references = build_merged_reference_list(
            document.inserted_citations.all(),
            document.manuscript_content,
        )
        buffer = build_manuscript_docx(
            document.manuscript_content,
            references=references,
            strip_in_body_references=True,
        )
        safe_name = re.sub(r'[^\w\s-]', '', document.title or "manuscript").strip() or "manuscript"
        safe_name = re.sub(r'[-\s]+', '-', safe_name)[:80]
        filename = f"{safe_name}.docx"
        return FileResponse(
            buffer,
            as_attachment=True,
            filename=filename,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="insert-citation",
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def insert_citation(self, request, pk=None):
        document = self.get_object()
        recommendation_id = request.data.get("recommendation_id")
        formatted_intext = (request.data.get("formatted_intext") or "").strip()
        csl_item = request.data.get("csl_item") or {}
        sentence_text = request.data.get("sentence") or request.data.get("sentence_text") or ""
        anchor_id = request.data.get("anchor_id") or ""
        pdf_position = request.data.get("pdf_position")
        citation_gap_id = request.data.get("citation_gap_id")

        if not formatted_intext:
            return Response(
                {"error": "formatted_intext is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recommendation = None
        citation_gap = None
        if recommendation_id:
            try:
                recommendation = Recommendation.objects.get(
                    id=recommendation_id,
                    citation__document=document,
                )
                citation_gap = recommendation.citation
            except Recommendation.DoesNotExist:
                return Response(
                    {"error": "Recommendation not found for this document."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        elif citation_gap_id:
            try:
                citation_gap = Citation.objects.get(id=citation_gap_id, document=document)
            except Citation.DoesNotExist:
                return Response(
                    {"error": "Citation gap not found for this document."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        manuscript_content = request.data.get("manuscript_content")
        if manuscript_content is not None:
            document.manuscript_content = manuscript_content
            document.save(update_fields=["manuscript_content"])

        inserted = InsertedCitation.objects.create(
            document=document,
            recommendation=recommendation,
            citation_gap=citation_gap,
            sentence_text=sentence_text,
            formatted_intext=formatted_intext,
            csl_item=csl_item,
            pdf_position=pdf_position,
            anchor_id=anchor_id,
        )

        references = build_merged_reference_list(
            document.inserted_citations.all(),
            document.manuscript_content,
        )

        return Response(
            {
                "inserted_citation": InsertedCitationSerializer(inserted).data,
                "formatted_intext": formatted_intext,
                "manuscript_content": document.manuscript_content,
                "references": references,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="search-papers",
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def search_papers_view(self, request):
        query = _sanitize_sentence(request.query_params.get("q") or "")
        if len(query) < 2:
            from .services.api_client import _configured_providers

            queried = _configured_providers()
            return Response(
                {
                    "results": [],
                    "count": 0,
                    "message": "Enter at least 2 characters to search.",
                    "providers_queried": queried,
                }
            )

        year_from = _parse_year_value(request.query_params.get("year_from"))
        year_to = _parse_year_value(request.query_params.get("year_to"))
        if year_from is not None and year_to is not None and year_from > year_to:
            year_from, year_to = year_to, year_from

        try:
            limit = int(request.query_params.get("limit", 20))
            limit = max(1, min(limit, 50))
        except (TypeError, ValueError):
            limit = 20

        try:
            results, providers_used, providers_queried = search_papers(
                query, limit=limit, year_from=year_from, year_to=year_to
            )
        except Exception as e:
            import traceback

            traceback.print_exc()
            return Response(
                {"error": "Search failed.", "detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        provider_label = ", ".join(providers_used) if providers_used else None
        return Response(
            {
                "query": query,
                "results": results,
                "count": len(results),
                "provider": provider_label,
                "providers_used": providers_used,
                "providers_queried": providers_queried,
            }
        )

    @action(detail=False, methods=["get"], url_path="debug-ss")
    def debug_ss(self, request):
        import os

        key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
        if key:
            return Response({"key_present": True, "prefix": key[:4]})
        return Response({"key_present": False}, status=status.HTTP_404_NOT_FOUND)

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
        url_path="process-pdf",
    )
    def process_pdf(self, request):
        doc_id = request.data.get("document_id")
        pdf_file = request.FILES.get("pdf_file") or request.FILES.get("file")
        
        document = None
        if doc_id:
            try:
                document = Document.objects.get(id=doc_id)
            except Document.DoesNotExist:
                return Response(
                    {"error": "Document not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
                
        if not pdf_file and not document:
            return Response(
                {"error": "No file provided and no valid document_id specified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if pdf_file:
                file_bytes = pdf_file.read()
                file_name = pdf_file.name.lower()
            else:
                file_bytes = document.file.read()
                file_name = document.file.name.lower()
                
            is_docx = file_name.endswith('.docx')
            
            if is_docx:
                sentence_objects = extract_docx_sentences(file_bytes)
            else:
                sentence_objects = extract_sentences(file_bytes)
            
            if not sentence_objects:
                return Response(
                    {"error": "Could not extract any valid sentences from the PDF."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            results = detect_gaps(sentence_objects)
            
            year_from, year_to = _year_range_from_request(request, document)
            enriched_results = fetch_recommendations(
                results, year_from=year_from, year_to=year_to
            )

            if doc_id and document:
                _seed_manuscript_if_empty(document, sentence_objects, file_bytes)
                _clear_document_citation_analysis(document)

                for gap in enriched_results:
                    citation = Citation.objects.create(
                        document=document,
                        sentence=gap.get("sentence"),
                        intent=gap.get("intent"),
                        score=gap.get("score"),
                        page_number=gap.get("pageNumber"),
                        bounding_boxes=gap.get("boundingBoxes"),
                        page_width=gap.get("pageWidth"),
                        page_height=gap.get("pageHeight"),
                    )

                    for rec in gap.get("recommendations", []):
                        Recommendation.objects.create(
                            citation=citation,
                            title=rec.get("title"),
                            authors=rec.get("authors"),
                            year=rec.get("year"),
                            abstract=rec.get("abstract"),
                            url=rec.get("url"),
                            doi=rec.get("doi"),
                            is_open_access=rec.get("isOpenAccess", False),
                            influential_citations=rec.get("influentialCitationCount", 0),
                        )

            return Response(
                {
                    "message": "Processing complete.",
                    "document_id": document.id if document else None,
                    "results": enriched_results,
                },
                status=status.HTTP_200_OK,
            )
            
        except Exception as e:
            import traceback

            traceback.print_exc()
            return Response(
                {"error": f"An error occurred during processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(
        detail=False,
        methods=["post"],
        url_path="recommend-for-sentence",
        parser_classes=[JSONParser],
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def recommend_for_sentence(self, request):
        sentence = _sanitize_sentence(request.data.get("sentence") or "")
        if len(sentence) < 20:
            return Response(
                {"error": "Sentence must be at least 20 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        intent = request.data.get("intent")
        doc_id = request.data.get("document_id")

        document = None
        if doc_id:
            try:
                document = Document.objects.get(id=doc_id)
            except Document.DoesNotExist:
                document = None

        year_from, year_to = _year_range_from_request(request, document)

        context = None
        if document and document.manuscript_content:
            try:
                sentence_norm = sentence.strip().lower()
                for para in document.manuscript_content:
                    para_text = para.get("text", "")
                    if para_text and sentence_norm in para_text.lower():
                        context = para_text
                        break
            except Exception as e:
                print(f"Error extracting context from document: {e}")

        try:
            result = fetch_recommendations_for_sentence(
                sentence,
                intent=intent or None,
                year_from=year_from,
                year_to=year_to,
                context=context,
            )
        except Exception as e:
            import traceback

            traceback.print_exc()
            return Response(
                {"error": "Failed to fetch recommendations.", "detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not result.get("recommendations"):
            year_hint = ""
            if year_from is not None or year_to is not None:
                y0 = year_from if year_from is not None else "…"
                y1 = year_to if year_to is not None else "…"
                year_hint = f" No papers published between {y0} and {y1} matched this sentence."
            return Response(
                {
                    "error": "No papers found for this sentence.",
                    "detail": (
                        "All configured literature APIs returned no results."
                        + year_hint
                    ),
                    "sentence": result.get("sentence", sentence),
                    "intent": result.get("intent"),
                    "score": result.get("score"),
                    "recommendations": [],
                    "provider": result.get("provider"),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if doc_id and document:
            page_number = request.data.get("page_number")
            page_width = request.data.get("page_width")
            page_height = request.data.get("page_height")
            bounding_boxes = request.data.get("bounding_boxes") or []

            citation = Citation.objects.create(
                document=document,
                sentence=result["sentence"],
                intent=result["intent"],
                score=result["score"],
                page_number=page_number,
                bounding_boxes=bounding_boxes if isinstance(bounding_boxes, list) else [],
                page_width=page_width,
                page_height=page_height,
            )
            created_recommendations = []
            for rec in result["recommendations"]:
                created_recommendations.append(
                    Recommendation.objects.create(
                        citation=citation,
                        title=rec.get("title"),
                        authors=rec.get("authors"),
                        year=rec.get("year"),
                        abstract=rec.get("abstract"),
                        url=rec.get("url"),
                        doi=rec.get("doi"),
                        is_open_access=rec.get("isOpenAccess", False),
                        influential_citations=rec.get("influentialCitationCount", 0),
                    )
                )
            result["recommendations"] = RecommendationSerializer(
                created_recommendations, many=True
            ).data
            result["citation_gap_id"] = citation.id

        return Response(result, status=status.HTTP_200_OK)


