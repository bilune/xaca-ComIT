var App = (function() {

	// Objeto que contiene todos los controles de jQuery
	var elems = {};
	
	var autocompleteCache = {};
	var polygonNbh;

	// --------DASHBOARD--------

	// Abre o cierra la sección 'Dashboard'
	var dashboardToggle = function (e) {
		if (e) e.preventDefault();

		elems.app.toggleClass('expanded');
		var navValue = localStorage.getItem('nav') === 'expanded' ? 'collapsed' : 'expanded';
		localStorage.setItem('nav', navValue);
	}

	// Abre la sección 'Dashboard'
	var dashboardOpen = function(e) {
		if (e) e.preventDefault();

		elems.app.addClass('expanded');
		localStorage.setItem('nav', 'expanded');
	}

	// Pide al servidor y carga las historias correspondientes al barrio seleccionado
	var dashboardLoadStories = function(id, name) {

		// Elimina el mensaje que se muestra cuando no hay barrio seleccionado
		elems.noNeighborhood.removeClass('d-flex').addClass('d-none');

		var dashboard = elems.dashboard;
		dashboard.addClass('loading');

		$.getJSON('http://localhost/api/historias.json', {}, function(result, status) {
			if (status === 'error') {
				// TO DO: Handle error
			} else {

				dashboard.append(
					$('<div></div>')
						.addClass('mt-4 mb-3 mx-3')
						.html('Estás viendo historias de <strong>'+name+'</strong>')
				);

				result.data.forEach(function(historia) {
					var card = dashboard
						.removeClass('loading')
						.append(historia.html)
						.find('.card:last');

					// Acorta los textos de las historias y agrega un botón para ver más
					shortenDescriptions(card);

					// Eventos para resaltar marcador cuando se hace 'hover' sobre una historia
					card
						.mouseenter(function() {
							markers[historia.id].setAnimation(google.maps.Animation.BOUNCE);
						})
						.mouseleave(function() {
							markers[historia.id].setAnimation(null);
						});
				});
			}
		});
	}

	// Acorta los textos de las historias y agrega un botón para ver más
	var shortenDescriptions = function(card) {
		var elem = card.find('.card-text');
		var text = elem.text();

		if (text.length > 140) {
			var firstPart = text.substr(0, 140);
			firstPart = firstPart.substr(0, Math.min(firstPart.length, firstPart.lastIndexOf(" "))) + '...';
	
			elem.html('<span>' + firstPart + '</span><a class="ml-2" href="#">Ver más</a>');
				
			elem
				.children('a')
				.click(function() {
					var a = $(this);
					var span = elem.children('span');
					span.empty();
					if (a.text() === 'Ver más') {
						span.text(text);
						a.text('Ver menos');
					} else {
						span.text(firstPart);
						a.text('Ver más');
					}
			});
		}
	}

	// Muestra u oculta los formularios para publicar una nueva historia
	var postStoryToggleForm = function(e) {
		if (e) e.preventDefault();

		var href = $(this).attr('href').substr(1);
		elems.postStoryForms.each(function() {
			$this = $(this);
			if ($this.hasClass('post-story__form--'+href)) {
				if ($this.hasClass('d-none')) {
					$this.removeClass('d-none');
				} else {
					$this.addClass('d-none');
				}
			} else {
				$this.addClass('d-none');
			}
		});
	}

	var postStoryCancel = function(e) {
		if (e) e.preventDefault();

		elems.postStoryForms
			.addClass('d-none')
			.trigger("reset");
	}

	var postNoticiaSubmit = function(e) {
		if (e) e.preventDefault();
			
		var $this = $(this);
		var inputUrl = elems.postNoticia.find('input#url');
		var loader = elems.postNoticia.find('.preview__loader');
		var preview = elems.postNoticia.find('.preview > div');


		var url = inputUrl.val();
		loader
			.removeClass('d-none')
			.addClass('d-block');
		preview.empty();

		$.getJSON('http://localhost/project/objetos.php', { url: url }, function(result, status) {
			if (status === 'error') {
				preview.text('Algo falló.');
			} else {
				if (result.html) {
					$this
						.val('Publicar')
						.prop('disabled', true);
					preview.html(result.html);

					mapSelectPoint($this, function(latLng) {
						if (latLng) {
							// TO DO: PUBLICAR INFORMACIÓN
						} else {
							// Elección de punto cancelada
							preview.empty();
							$this.val('Previsualizar').prop('disabled', false);
						}
					});
				} else {
					preview.text('No es una url válida.');
				}
			}
			loader
				.addClass('d-none')
				.removeClass('d-block');
		});
	}


	// --------NAV--------

	// Enfoca el input para buscar los barrios
	var focusSearchInput = function(e) {
		if (e) e.preventDefault();
		elems.navbarSearchInput.focus();
	}

	// Inicia el script autocomplete
	var autocompleteInit = function() {
		elems.navbarSearchInput.autocomplete({
			appendTo: '.navbar',
			position: {
				my: "left top+8"
			},
			minLength: 0,
			source: function( request, response ) {
				var term = request.term;
				if (term in autocompleteCache) {
					response( autocompleteCache[ term ] );
					return;
				}
				$.getJSON( "http://localhost/api/barrios.json", request, function( data, status, xhr ) {
					autocompleteCache[ term ] = data.data;
					response( data.data );
				});
			}
		});
	}

	// Abre el autocomplete cuando se hace click en el input
	var autocompleteOpen = function() {
		var value = elems.navbarSearchInput.val();
		elems.navbarSearchInput.autocomplete('search', value);
	}

	// Se ejecuta cuando se selecciona una opción del autocomplete
	// Se cargan historias en 'Dashboard' y límites en el mapa
	var autocompleteSelect = function(e, ui) {
		e.preventDefault();

		elems.navbarSearchInput
			.val('')
			.blur();
		
		dashboardOpen();

		$.getJSON('http://localhost/api/barrio-bounds.json', { id: ui.item.id }, function(result, status) {
			if (status === 'error') {
				// TO DO: Handle error
			} else {

				mapFitBounds(result.data.boundingBox, result.data.bounds);
				dashboardLoadStories(ui.item.id, ui.item.value);

			}
		});

	}

	// --------MAP--------

	// Enfoca y agrega los límites del barrio seleccionado en el mapa
	var mapFitBounds = function(boundingBox, nbhBounds) {

		var bounds = new google.maps.LatLngBounds();
		boundingBox.forEach(function(val) {
			bounds.extend({
				lat: val[1],
				lng: val[0]
			});
		});

		// Enfoca el mapa
		map.fitBounds(bounds); 

		// Elimina el polígono anterior
		if (polygonNbh) polygonNbh.setMap(null); 

		// Crea el nuevo polígono y lo agrega al mapa
		polygonNbh = new google.maps.Polyline({
			clickeable: false,
			strokeColor: '#000',
			strokeOpacity: '0.1',
			strokeWeight: 0.5,
			map: map,
			icons: [{
				icon: {
					path: 'M 0,-1 0,1',
					fillOpacity: 0.2,
					scale: 3
				},
				offset: 0,
				repeat: '20px'
			}],
			path: nbhBounds.map(function(val) {
				return {
					lat: val[1],
					lng: val[0]
				};
			})
		});
		
	}

	// Permite insertar un punto en el mapa y devuelve el valor del punto si la publicación no es cancelada
	var mapSelectPoint = function($this, callback) {

		elems.mapSelectPointPopover.removeClass('d-none');

		var marker;

		var listener = google.maps.event.addListener(map, 'click', function(e) {
			if (typeof marker !== 'undefined') {
				marker.setMap(null);
			}
			marker = new google.maps.Marker({
				position: e.latLng,
				map: map
			});
			$this.prop('disabled', false);
			
			callback(e.latLng);
		});

		$this
			.siblings('.post-story__cancel-button')
			.click(function(e) {
				e.preventDefault();

				google.maps.event.removeListener(listener);
				if (typeof marker !== 'undefined') {
					marker.setMap(null);
				}
				elems.mapSelectPointPopover.addClass('d-none');

				callback(false);
			});

	}










	// Función que selecciona todos los elementos necesarios y los retorna en un objeto
	var enlazarElems = function () {
        var self = {};

		// App
		self.app = $('.app');

		// Navbar
		self.navbar = $('.navbar');
		self.navbarSearchInput = $('input.autocomplete');

		// Dashboard
		self.dashboard = $('.dashboard');
		self.noNeighborhood = $('#no-neighbour-selected');

		self.postStoryButtons = $('.post-story__button');
		self.postStoryForms = $('.post-story__form');
		self.postStoryCancelButton = $('.post-story__cancel-button');

		self.postNoticia = $('.post-story__form--noticia');
		self.postNoticiaSubmitButton = $('.post-story__form--noticia .post-story__submit-button');
		self.postEventoSubmitButton = $('.post-story__form--evento .post-story__submit-button');
		self.postReporteSubmitButton = $('.post-story__form--reporte .post-story__submit-button');

		// Map
		self.map = $('.map');
		self.mapSelectPointPopover = $('.map__select-point');

		// Buttons (fire actions)
		self.buttonToggleDashboard = $('.button__toggle-dashboard');
		self.buttonFocusSearch = $('.button__focus-search');

		return self;

	};
	
	// Función que enlaza las funciones con los elementos a través de eventos
	var enlazarFunciones = function() {

		elems.buttonToggleDashboard.on('click', dashboardToggle);
		elems.buttonFocusSearch.on('click', focusSearchInput);
		elems.navbarSearchInput.on({
			'focus': autocompleteOpen,
			'autocompleteselect': autocompleteSelect
		});

		elems.postStoryButtons.on('click', postStoryToggleForm);
		elems.postStoryCancelButton.on('click', postStoryCancel);

		elems.postNoticiaSubmitButton.on('click', postNoticiaSubmit);

    };

	var init = function() {

		// Asigna a elem los elementos
		elems = enlazarElems();
		enlazarFunciones();

		autocompleteInit();

		// Vuelve la sección 'Dashboard' a la última posición deseada por el usuario
		if (localStorage.getItem('nav') === 'expanded') {
			dashboardToggle();
		}
		
	}

	return {
		init: init
	};


})();

$(document).ready(App.init);